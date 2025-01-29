'use server'

import {openai} from '@ai-sdk/openai'
import {generateText} from 'ai'
import {PrismaClient} from "@prisma/client";

const prisma = new PrismaClient()

type Messages = {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

/**
 * Send a message to the chatbot.
 * @param {string} prompt - Content of the message.
 * @param {string } user - Allows the chatbot to keep track of the user
 * @returns {Promise<string | null>} - The chatbot's response.
 */
const sendTextChatExample = async (prompt: string, user: string = 'tyler@clevoro.com'): Promise<string | null> => {

    const userHistory = await prisma.history.findMany({where: {userId: user}})

    if (userHistory.length === 0) {
        // initialize the chat history for the user with the pre-made system prompt
        await prisma.history.create({
            data: {
                userId: user,
                content: 'You are a helpful assistant.',
                type: 'system'
            }
        }).catch(e => {
            console.error('Could not create the initial system message', e)
            throw new Error(e)
        })
    }

    // append the user's message to the chat history
    await prisma.history.create({
        data: {
            userId: user,
            content: prompt,
            type: 'user'
        }
    })

    const model = openai.chat('gpt-4-turbo', {user})

    // send the entire conversation to the model
    const messages: Messages[] = await prisma.history
        .findMany({where: {userId: user}})
        .then(history => {
            return history.map(msg => {
                return {
                    role: msg.type as 'system' | 'user' | 'assistant',
                    content: msg.content,
                }
            })
        })

    const {text} = await generateText({model, messages})

    // append the chatbot's response to the chat history
    await prisma.history.create({
        data: {
            userId: user,
            content: text,
            type: 'assistant'
        }
    })

    return text
}

export default sendTextChatExample