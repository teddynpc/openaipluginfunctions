import { test } from "vitest";

const { Configuration, OpenAIApi } = require("openai");
const configuration = new Configuration({
    apiKey: "",
});
const openai = new OpenAIApi(configuration);

import { createClient } from '@supabase/supabase-js'

// Create a single supabase client for interacting with your database
const supabase = createClient('');

export const getRelevantPlugins = async (input:string)=> {
    const embeddingResponse = await openai.createEmbedding({
        model: 'text-embedding-ada-002',
        input: input,
    })

    const [{ embedding: userEmbedding }] = embeddingResponse.data.data

    // Query the 'plugins' table in Supabase to get the most relevant result
    const { data: pluginData } = await supabase.rpc('match_plugins', {
        query_embedding: userEmbedding,
        match_threshold: 0.6, // Choose an appropriate threshold for your data
        match_count: 3, // Choose the number of matches
      })
    return pluginData;
}

// embed each openai function and store it in the supabase vector database database
test('embed', async () => {
    const fs = require('fs');
    const path = require('path');

    const openaifunctionsDir = './openaifunctions'; // specify the directory where the JSON files are located
    const files = fs.readdirSync(openaifunctionsDir);
    for (const file of files) {
        const filePath = path.join(openaifunctionsDir, file);
        const filename = path.basename(filePath, '.json');
        
        const fileContent = fs.readFileSync(filePath, 'utf8');
        let jsonData = JSON.parse(fileContent);

        // if jsonData is just one object, convert it into an array
        if (!(jsonData instanceof Array)) {
            jsonData = [jsonData];
        }

        for (const func of jsonData) {
            // Now jsonData contains the content of the file as a JavaScript object
            // You can process it as needed
            const functionBody = func;
            const pluginname = filename;
            const embedded_text = `${func.name} is a plugin used to ${func.description}. Function of the plugin: ${func.url} It includes the parameters: ${JSON.stringify(func.parameters)}`

            // Generate a vector using OpenAI
            const embeddingResponse = await openai.createEmbedding({
                model: 'text-embedding-ada-002',
                input: embedded_text,
            })

            const [{ embedding }] = embeddingResponse.data.data

            // Store the vector in Postgres
            const { data, error } = await supabase.from('plugins').insert({
                function: functionBody,
                pluginname,
                embedded_text,
                embedding,
            })

            console.log(data, error);
        }
    }
},6000000);

// 2. Test retrieve the most relevant function
test('retrieve-most-relevant', async ()=>{
    const pluginData= await getRelevantPlugins("can you run this code snippet print('hello world')?")
    console.log(pluginData);
},100000)
