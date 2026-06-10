import * as Ably from 'ably';
import dotenv from 'dotenv';

dotenv.config();

const ablyApiKey = process.env.ABLY_API_KEY;

if (!ablyApiKey) {
  console.warn('⚠️ ABLY_API_KEY environment variable is not defined!');
}

export const ablyRest = ablyApiKey ? new Ably.Rest({ key: ablyApiKey }) : null;

/**
 * Generates a scoped Ably token request for a user inside a specific session.
 * @param userId Unique identifier of the user (clientId)
 * @param roomId Unique room ID to scope the capabilities
 */
export async function generateAblyTokenRequest(userId: string, roomId: string) {
  if (!ablyRest) {
    throw new Error('Ably Rest Client is not initialized. Please configure ABLY_API_KEY.');
  }

  // Capability restrictions: only subscribe, publish, presence and history on the specific room channel
  const tokenRequest = await ablyRest.auth.createTokenRequest({
    clientId: userId || 'anonymous',
    capability: {
      [`session:${roomId}`]: ['subscribe', 'publish', 'presence', 'history']
    }
  });

  return tokenRequest;
}
