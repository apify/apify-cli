#!/bin/bash

# Creates COMMANDS.md file with a content generated using "apify help"
# TODO: Automatically update readme.md!

npm install
npm install . -g

HELP_FILE="COMMANDS.md"
#README_FILE="README.md"
COMMANDS_DIR='src/commands/'

# help command and title
echo "<!-- COMMANDS_ARE_AUTOMATICALLY_COPIED_BELOW_HERE -->" > ${HELP_FILE}
echo "" >> ${HELP_FILE}
echo "\`\`\`text" >> ${HELP_FILE}
apify help >> ${HELP_FILE}
echo "\`\`\`" >> ${HELP_FILE}

# Gets all command
for entry in "$COMMANDS_DIR"*
do
    COMMAND_FILE=${entry/$COMMANDS_DIR}
    COMMAND_NAME=${COMMAND_FILE/.js}
    echo "### apify $COMMAND_NAME" >> ${HELP_FILE}
    echo "\`\`\`text" >> ${HELP_FILE}
    apify ${COMMAND_NAME} --help >> ${HELP_FILE}
    echo "\`\`\`" >> ${HELP_FILE}
done

echo "" >> ${HELP_FILE}
echo "<!-- COMMANDS_ARE_AUTOMATICALLY_COPIED_BELOW_HERE -->" >> ${HELP_FILE}
