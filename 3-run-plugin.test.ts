import { test } from 'vitest';
import { getRelevantPlugins } from './2-embed.test';
const { Configuration, OpenAIApi } = require("openai");

const configuration = new Configuration({
    apiKey: "",
});
const openai = new OpenAIApi(configuration);

type Message = {
    role: string,
    content: string,
    function_call?: {
        name: string,
        arguments: string
    }
    name?: string
};

test('run relevant', async () => {
    const user_query = `what's this video about https://www.youtube.com/watch?v=pCtJefL1fj8?`
    const functions = (await getRelevantPlugins(user_query)).map(p=>JSON.parse(p.content));
    const parseFunctionCall = (function_call: {name: string, arguments: string}) => {
        console.log(function_call);
        const args = JSON.parse(function_call.arguments);
        const name = function_call.name;
        return {name, args}
    }
    const messages:Message[] = [{ role: "user", content: user_query }]
    console.log("calling with:",messages,functions);
    const chatCompletion = await openai.createChatCompletion({
        model: "gpt-3.5-turbo-0613",
        messages,
        functions: functions
    });
    const message = chatCompletion.data.choices[0].message
    console.log(message);
    if(message.function_call)
    {
        const {name, args} = parseFunctionCall(message.function_call);
        console.log(name, args);
        const function_metadata = functions.find(f => f.name==name)
        const function_response = await fetch(function_metadata?.url ?? "", {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(args)
        })
        const responseText = await function_response.text();
        console.log("response function:", responseText)
        messages.push(message);
        messages.push({
            role: "function",
            name: name,
            content: responseText ?? "",
        })
    }
    console.log("final conversation:", messages);
},600000);
