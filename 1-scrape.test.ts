import { test } from "vitest";
import axios from 'axios';
import puppeteer from 'puppeteer';
const path = require('path');
const yaml = require('js-yaml');
const fs = require('fs');

const { Configuration, OpenAIApi } = require("openai");
const configuration = new Configuration({
    apiKey: "",
});
const openai = new OpenAIApi(configuration);

type OpenAIFunction = {
    "name": string,
    "description": string,
    "method": string
    "url": string,
    "parameters": {
        "type": string,
        "properties": {
            [key: string]:{
                "type": string,
                "description"?: string,
                "enum"?:string[],
            },
        }[],
        "required": string[],
    }   
}


// 1. First scrape all the plugins jsons from the pugin.ai website
test('scrape-plugin-jsons',async ()=>{
    console.log("starting");
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto('https://pugin.ai/');

    const fs = require('fs');
    const path = require('path');
    const links = await page.$$eval('div.p-2.sm\\:p-2 a.flex.flex-col.relative.h-full', links => links.map(link => link.href));
    for (let link of links) {
        await page.goto(link);
    //     const divs = await page.$$('div.flex.items-start.mb-1');
    // console.log("divs", divs)
    // const buttons = await divs[1].$$('button');
    // await buttons[0].click();
    

    const preText = await page.$eval('pre[style="display: block; overflow-x: auto; padding: 0.5em; background: rgb(40, 42, 54); color: rgb(248, 248, 242); line-height: 1.4; font-size: 12px;"]', el => el.textContent);
    console.log(preText);
        const filename = new URL(link).pathname.split('/').pop()+'.json';
        fs.mkdirSync(path.join(__dirname, 'aiplugin'), { recursive: true });
        fs.writeFileSync(path.join(__dirname, 'aiplugin', filename), preText);
    }
    
    await browser.close();    
}, {timeout: 600000});

// 2. Scrape the actual plugin manifests from each downloaded JSON of YML
test('scrape-yamls', async() =>{
    const fs = require('fs');
    const path = require('path');
    const yaml = require('js-yaml');
    const aipluginFolder = path.join(__dirname, 'aiplugin');
    const openapiFolder = path.join(__dirname, 'openapi');
    fs.mkdirSync(openapiFolder, { recursive: true });
    const files = fs.readdirSync(aipluginFolder);

    for (const file of files) {
        try{
        const filePath = path.join(aipluginFolder, file);
        const plugin = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        // console.log(plugin);
        const url = plugin.api.url;
        const response = await Promise.race([
            axios.get(url),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Timeout')), 5000)  // 5 seconds timeout
            )
        ]);

        if(url.endsWith('.yaml') || url.endsWith('.yml')) {
            const yamlData = yaml.load(response.data);
            const yamlFilename = plugin.name_for_human + '.yaml';
            const yamlFilePath = path.join(openapiFolder, yamlFilename);
            // console.log(yamlData);
            // console.log(yamlFilePath);
            fs.writeFileSync(yamlFilePath, yaml.dump(yamlData));
        }else{
            const jsonData = response.data
            const jsonFilename = plugin.name_for_human + '.json';
            const jsonFilePath = path.join(openapiFolder, jsonFilename);
            // console.log(jsonData);
            // console.log(jsonFilePath);
            fs.writeFileSync(jsonFilePath, JSON.stringify(jsonData, null, 2));
        }
        console.log("success with:", file);
        }catch(e){
            console.error(`Failed for ${file}`+e);
        }

    }
}, 60000000)


// 3. Convert the OpenAPI Plugin schemas into OpenAI function schemas using GPT4
test('convert-function-gpt', async ()=>{
    const openapiFolder = path.join(__dirname, 'openapi-fav');
    const files = fs.readdirSync(openapiFolder);
    console.log(files);
    for(const file of files.slice(8)){
        const filePath = path.join(openapiFolder, file);
        const filename = path.basename(file, '.yaml');
        const data = fs.readFileSync(filePath, 'utf8');
        const parsedData = yaml.load(data);
        const yamlString = yaml.dump(parsedData);
        
        const prompt = `
        Please help me turn an OpenAPI schema into an OpenAI function schema. You don't need to include response codes. You don't need to include response schema 
types. You should create separate functions in a list for separate endpoint paths. Respond only in JSON - don't not say anything else.

        OpenAPI schema: ${data}

        Example function schema:
{
            "name": "get_current_weather",
            "description": "Get the current weather in a given location",
            "url": "", //including endpoint path
            "method":"POST"//POST or GET
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {
                        "type": "string",
                        "description": "The city and state, e.g. San Francisco, CA",
                    },
                    "unit": { "type": "string", "enum": ["celsius", "fahrenheit"] },
                },
                "required": ["location"],
            },
        }
Function Schema in valid JSON:
        `;
        console.log(prompt);

        const chatCompletion = await openai.createChatCompletion({
            model:"gpt-4-0613",
            messages: [{role:'user', content:prompt}],
        })
        const message = chatCompletion.data.choices[0].message;
        console.log(message);
        const jsonFunction = JSON.parse(message.content);
        const openaiFunctionsFolder = path.join(__dirname, 'openaifunctions');
        fs.mkdirSync(openaiFunctionsFolder, { recursive: true });
        const functionFilePath = path.join(openaiFunctionsFolder, `${filename}.json`);
        fs.writeFileSync(functionFilePath, JSON.stringify(jsonFunction, null, 2));
    }
},60000000);

// WIP: Try and convert each function schema into a function using a parser
// test('convert-functions', async() => {
//     const openapiFolder = path.join(__dirname, 'openapi');
//     const files = fs.readdirSync(openapiFolder);

//     for (const file of files) {
//         const filePath = path.join(openapiFolder, file);
//         const data = fs.readFileSync(filePath, 'utf8');
//         console.log(`Loaded file: ${file}`);
//         console.log(data);
//         if(filePath.endsWith('.yaml') || filePath.endsWith(".yml"))
//         {
//             const parsedData = yaml.load(data);
//             // console.log(`Parsed YAML data: ${parsedData}`);
//             const paths = parsedData.paths
//             const serverUrl = parsedData.servers[0].url;
//             console.log("serverURL:", serverUrl);
//             console.log("paths:", paths);
            
//             for(const [pathName, ops] of Object.entries(paths)){
//                 console.log("Pathname:",pathName," ops:", ops);
//                 for(const [opName, opBody] of Object.entries(ops)){
//                     // need to figure out how to combine both requestBody for a POST and query parametesr in the same function declaration :(
//                     if(opBody.requestBody){
//                         const parameters = {"type": "object"};
//                         const schemaRef = opBody.requestBody.content['application/json'].schema['$ref']
//                         const schema = parsedData.components.schemas[schemaRef.replace('#/components/schemas/', '')];
                        
//                         console.log("request Body Schema", schema);
//                     }
//                     if(opBody.parameters){
//                         const parameters = {"type": "object"};
//                         const required_params = [];
//                         console.log("opbody.parameters", opBody.parameters)
//                         for(const parameter of opBody.parameters){
//                             const {name, in, description, required, schema} = parameter;
//                             console.log("schema",schema);
//                             parameters[name] = {
//                                 type: schema['type'],
//                                 description: description
//                             }
//                             if(required) required_params.push(name) ;
//                         }
//                         const newFunction:OpenAIFunction = {
//                             name: opBody.operationId,
//                             method: opName,
//                             description: opBody.summary,
//                             url: serverUrl+pathName,
//                             parameters,
//                             required: required_params,
//                         }
//                         console.log("Generated function:", newFunction)
//                     }
//                 }
//             }
//         }
//         else if(filePath.endsWith('.json')) {
//             const parsedData = JSON.parse(data);
//             console.log(`Parsed JSON data: ${parsedData}`);
//         }
//         break;
//     }
// });
