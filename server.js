const express = require('express');
const Docker = require('dockerode');
const cors = require('cors');
const stream = require('stream');

const app = express();
const port = 3000;
const docker = new Docker();

app.use(express.json());
app.use(cors()); // Enable CORS for all routes

// A map to associate languages with their respective Docker images
const languageImageMap = {
    python: 'python:3.9-slim',
    javascript: 'node:18-alpine'
};

app.post('/execute', async (req, res) => {
    const { language, code } = req.body;

    if (!language || !code) {
        return res.status(400).json({ error: 'Language and code are required.' });
    }

    const imageName = languageImageMap[language];
    if (!imageName) {
        return res.status(400).json({ error: 'Unsupported language.' });
    }

    // Determine the command to execute the code inside the container
    const cmd = language === 'python' 
        ? ['python', '-c', code] 
        : ['node', '-e', code];
    
    let container;
    
    try {
        console.log(`Attempting to run code for language: ${language} using image: ${imageName}`);

        // Pull the image if it's not present (optional, but good practice)
        await pullImage(imageName);

        // Create a new container
        container = await docker.createContainer({
            Image: imageName,
            Cmd: cmd,
            Tty: false,
            // Security configurations
            HostConfig: {
                // Limit CPU usage
                CpuShares: 512, // Relative weight, 1024 is default
                // Limit memory usage to 256MB
                Memory: 256 * 1024 * 1024,
                // Disable networking to prevent malicious network activity
                NetworkMode: 'none'
            }
        });
        
        // Attach to the container's streams to get output
        const logStream = new stream.PassThrough();
        let output = '';
        logStream.on('data', chunk => {
            output += chunk.toString('utf8');
        });
        
        await container.attach({ stream: true, stdout: true, stderr: true }, (err, stream) => {
            if (err) {
              console.error('Error attaching to container:', err);
              return;
            }
            container.modem.demuxStream(stream, logStream, logStream);
        });
        
        // Start the container
        await container.start();
        console.log(`Container ${container.id.substring(0,12)} started.`);

        // Wait for the container to finish, with a timeout
        const waitResult = await container.wait({ timeout: 10000 }); // 10 second timeout

        if (waitResult.StatusCode === null) {
          // This can happen on timeout
          throw new Error('Execution timed out.');
        }

        console.log(`Container finished with status code: ${waitResult.StatusCode}`);
        
        // Send the captured output back to the client
        res.status(200).json({ output: output.trim() });

    } catch (error) {
        console.error('Error during code execution:', error);
        res.status(500).json({ error: error.message || 'An error occurred during execution.' });
    } finally {
        // IMPORTANT: Always remove the container after execution
        if (container) {
            try {
                await container.remove();
                console.log(`Container ${container.id.substring(0,12)} removed.`);
            } catch (removeError) {
                console.error('Error removing container:', removeError);
            }
        }
    }
});

// Helper function to pull a Docker image
async function pullImage(imageName) {
    console.log(`Checking for image: ${imageName}`);
    const images = await docker.listImages({ filters: { reference: [imageName] } });
    if (images.length === 0) {
        console.log(`Image not found locally. Pulling ${imageName}...`);
        const stream = await docker.pull(imageName);
        await new Promise((resolve, reject) => {
            docker.modem.followProgress(stream, (err, res) => err ? reject(err) : resolve(res));
        });
        console.log(`Image ${imageName} pulled successfully.`);
    } else {
        console.log(`Image ${imageName} found locally.`);
    }
}


app.listen(port, () => {
    console.log(`Code execution server listening at http://localhost:${port}`);
});
