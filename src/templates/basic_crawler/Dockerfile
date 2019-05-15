# Dockerfile contains instructions how to build a Docker image that will contain
# all the code and configuration needed to run your actor. For a full
# Dockerfile reference, see https://docs.docker.com/engine/reference/builder/

# First, specify the base Docker image. Apify provides the following base images
# for your convenience:
#  apify/actor-node-basic (Node.js 10 on Alpine Linux, small and fast image)
#  apify/actor-node-chrome (Node.js 10 + Chrome on Debian)
#  apify/actor-node-chrome-xvfb (Node.js 10 + Chrome + Xvfb on Debian)
# For more information, see https://apify.com/docs/actor#base-images
# Note that you can use any other image from Docker Hub.
FROM apify/actor-node-basic

# Second, copy just package.json and package-lock.json since they are the only files
# that affect NPM install in the next step
COPY package*.json ./

# Install NPM packages, skip optional and development dependencies to keep the
# image small. Avoid logging too much and print the dependency tree for debugging
RUN npm --quiet set progress=false \
 && npm install --only=prod --no-optional \
 && echo "Installed NPM packages:" \
 && npm list \
 && echo "Node.js version:" \
 && node --version \
 && echo "NPM version:" \
 && npm --version

# Next, copy the remaining files and directories with the source code.
# Since we do this after NPM install, quick build will be really fast
# for simple source file changes.
COPY . ./

# Specify how to run the source code
CMD npm start
