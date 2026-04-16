/*
    Sorts the "JSON" barf according to the MAVLink guidelines here: https://mavlink.io/en/guide/serialization.html#field_reordering

    This is needed because the most comprehensive documentation on what MAVLink packets *ACTUALLY* look like is... lacking.
    If you try parsing MAVLink files according to the official documentation here, you'll end up with unusable gibberish.
    @see https://mavlink.io/en/messages/common.html
*/
import { writeFileSync } from 'node:fs';
import { XMLBuilder } from 'fast-xml-parser';
const builder = new XMLBuilder({
  ignoreAttributes: false,
  format: true
});

// This JSON file contains all the MAVLink packet types and their "official" XML structure (including extensions)
// These are indexed by message ID
import MAVLINK_DEFS from '../assets/defs.json' with {type: 'json'};

// This JSON file contains all data types used by MAVLink and their size (in bytes)
import MAVLINK_DATA_TYPES from '../assets/mavlinkDataTypes.json' with {type: 'json'};

/**
 * Parses MAVLink definitions
 * @param {string} format Whether to dump output in `XML` or `JSON`. 'JSON' by default.
 * @param {boolean} includeDescription Whether to include description of the MAVLink message types and MAVLink fields.
 * @param {boolean} includeType Whether to include MAVLink field type (such as uint64_t). Might be useful in C. Might not be useful in Node/Python.
 * @param {boolean} includeUnits Whether to include units of fields (ie. degE7)
 * @returns The XML or JSON output representing the actual MAVLink schema.
 */
const parseDefs = (format='JSON', includeDescription=false, includeType=false, includeUnits=false) => {

    if (format != 'XML' && format != 'JSON')
    {
        throw 'Error in when parsing MAVLink definitions: `format` must be `XML` or `JSON`.'; 
    }

    // We will build the output in JSON. If necessary, we'll convert it to XML later.
    let output = {};

    for (const messageID in MAVLINK_DEFS)
    {
        // This will be what's appended to $output for this messageID
        let messageOutput = {};

        const messageSchema = MAVLINK_DEFS[messageID];
        const messageType = messageSchema[':@']['@_name'];
        const messageDescriptionField = messageSchema.message.filter(obj => obj.description != undefined)[0];
        const messageDescription = messageDescriptionField.description[0]['#text'];
        const messageFields = messageSchema.message.filter(obj => obj.field != undefined || obj.extensions != undefined);

        // Split message fields into pre-MAVLink 2.0 extensions and post-MAVLink 2.0 extensions
        let messageFieldsPreExt = [];
        let messageFieldsPostExt = [];
        let afterExtField = false;
        messageFields.forEach((messageField) => {
            
            // Extensions are indicated by object with field "extensions"
            if (messageField.extensions != undefined)
            {
                afterExtField = true;
            }
            else
            {
                // Construct field object
                let fieldOutput = {};
                fieldOutput.name = messageField[':@']['@_name'];
                if (includeDescription) fieldOutput.description = messageField.field.length == 0 ? '' : messageField.field[0]['#text'];

                let fieldType = messageField[':@']['@_type'];
                if (includeType) fieldOutput.type = fieldType;

                if (fieldType.includes('['))
                {
                    // For later down the line: 
                    // Arrays are handled based on the data type they use, not based on the total array size
                    let arrDataType = fieldType.substring(0, fieldType.indexOf('['));
                    fieldOutput.isArray = true;
                    fieldOutput.size = MAVLINK_DATA_TYPES[arrDataType];
                    fieldOutput.len = fieldType.substring(fieldType.indexOf('[') + 1, fieldType.indexOf(']'));
                }
                else
                {
                    fieldOutput.isArray = false;
                    fieldOutput.size = MAVLINK_DATA_TYPES[fieldType];
                }
                
                let unit = messageField[':@']['@_units'];
                if (includeUnits) fieldOutput.unit = unit == undefined ? '' : unit;

                let enums = messageField[':@']['@_enum'];
                if (includeUnits) fieldOutput.enum = enums == undefined ? '' : enums;

                // Add to the right array
                if (afterExtField)
                {
                    messageFieldsPostExt.push(fieldOutput);
                }
                else
                {
                    messageFieldsPreExt.push(fieldOutput);
                }
            }
        });

        // The message fields pre-extension are sorted by size.
        // If two fields have the same length, their order is preserved like it was during defs.json.
        // Arrays are handled based on the data type they use, not based on the total array size
        messageFieldsPreExt.sort((field1, field2) => {
            // < 0 - field1 goes before field2. > 0 - field2 goes before field1
            return field1.size - field2.size
        });

        let fieldsSorted = [...messageFieldsPreExt, ...messageFieldsPostExt];

        // Construct message output
        messageOutput.type = messageType;
        if (includeDescription) messageOutput.description = messageDescription;
        messageOutput.fields = fieldsSorted;
        
        output[messageID] = messageOutput;
    }

    // Return either prettified json string, or xml
    if (format == 'JSON')
    {
        return JSON.stringify(output, null, 2);
    }
    else    // format == 'XML'
    {
        return builder.build(output);
    }
}


// Create a bunch of XML files for each specific need

// Creates file with everything. This is useful when we generate legit documentation later.
writeFileSync('../mavlink_all.json', parseDefs('JSON', true, true, true));
writeFileSync('../mavlink_all.xml', parseDefs('XML', true, true, true));

// Creates a minimal file to use for programming in Python
writeFileSync('../mavlink_min.json', parseDefs('JSON', false, false, false));
writeFileSync('../mavlink_min.xml', parseDefs('XML', false, false, false));

// Creates a normal file that can be used for programming but with a bit more context
writeFileSync('../mavlink.json', parseDefs('JSON', false, true, true));
writeFileSync('../mavlink.xml', parseDefs('XML', false, true, true));

console.log("Sort Defs executed successfully.");