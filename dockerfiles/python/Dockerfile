# Use a minimal, official Python image as a base
FROM python:3.9-slim

# Set the working directory inside the container
WORKDIR /app

# Create a non-root user to run the code for security reasons
# This prevents code executed in the container from having root privileges
RUN useradd --create-home --shell /bin/bash coder

# Switch to the non-root user
USER coder

# When the container is run via the API, the `Cmd` will be overridden
# with the user's code. This CMD is just a placeholder.
CMD [ "python" ]

