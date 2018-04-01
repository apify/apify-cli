#!/bin/bash

# create file .md with generated from command --help

HELP_FILE="${1}"
COMMANDS_DIR='cli/commands/'

# help command and title
echo '## Commands' > ${HELP_FILE}
echo "\`\`\`" >> ${HELP_FILE}
apify help >> ${HELP_FILE}
echo "\`\`\`" >> ${HELP_FILE}

# Gets all command
for entry in "$COMMANDS_DIR"*
do
    COMMAND_FILE=${entry/$COMMANDS_DIR}
    COMMAND_NAME=${COMMAND_FILE/.js}
    echo "### apify $COMMAND_NAME" >> ${HELP_FILE}
    echo "\`\`\`" >> ${HELP_FILE}
    apify ${COMMAND_NAME} --help >> ${HELP_FILE}
    echo "\`\`\`" >> ${HELP_FILE}
done
