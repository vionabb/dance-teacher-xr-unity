from enum import Enum
from .secrets import OPENAI_API_KEY

import openai
import os
import pandas
import time
import json
openai.api_key = OPENAI_API_KEY

# Get list of models at: https://platform.openai.com/docs/models/gpt-4
class Models(Enum):
    GPT35 = "gpt-3.5-turbo"
    GPT4 = "gpt-4"

SYSTEM_INSTRUCTIONS = """You are a dance coach that gives helpful, encouraging feedback to dancers.
A dancer has just finished a performance."""

def give_dance_feedback(spoken_feedback: str):
    print("Spoken feedback: {}".format(spoken_feedback))

def get_dance_feedback(user_name: str, perf_data: dict, model=Models.GPT35.value):
    messages = [
        {"role": "system", "content": """You are a dance coach that gives helpful, encouraging feedback to dancers.\
A dancer has just finished a performance. Their performance data is as follows:"""},
        {"role": "system", "content": json.dumps(perf_data)},
        {"role": "system", "content": 'The user is named "{}".'.format(user_name)},
        {"role": "system", "content": 'Please give feedback to the dancer.'},
    ]

    functions = [
        {
            "name": "give_dance_feedback",
            "description": "Gives feedback to a dancer.",
            "parameters": {
                "type": "object",
                "properties": {
                    "spoken_feedback": {
                        "type": "string",
                        "description": "The feedback that the system will speak to the dancer, using text-to-speech. Should be succinct, at most 20 words.",
                    },
                },
                "required": ["spoken_feedback"],
            }
        }
    ]

    response = openai.ChatCompletion.create(
        model=model,
        messages=messages,
        functions=functions,
        function_call={"name" : "give_dance_feedback"},
        temperature=1,
    )

    response_msg = response["choices"][0]["message"]
    if not response_msg.get("function_call"):
        print("No function call found in response.")
        print(response)
        return
    
    function_name = response_msg["function_call"]["name"]
    function_args = json.loads(response_msg["function_call"]["arguments"])

    match function_name:
        case "give_dance_feedback":
            give_dance_feedback(function_args.get("spoken_feedback"))
        case _:
            print("Function {} not found.".format(function_name))



def get_completion(prompt: str, model=Models.GPT35.value):

    messages = [{"role": "user", "content": prompt}]

    response = openai.ChatCompletion.create(
        model=model,
        messages=messages,
        temperature=1,
    )
    return response

if __name__ == "__main__":
    
    # Continuously prompt on the command line, getting the completion
    # from the OpenAI, and printing the response. Abort when ctrl-c is
    # pressed.
    while True:
        try:
            get_dance_feedback("Viona", { "spatialAccuracy": 0.95, "rhythmAccuracy": 0.89, "performanceTrend": "increasing" })

        except KeyboardInterrupt:
            print("Bye!")
            break



