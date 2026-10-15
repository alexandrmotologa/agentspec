export const handler = async (event: any) => {
  if (event.inputText === 'CRASH') {
    throw new Error('Simulated fatal runtime crash');
  }

  // Return unformatted object missing Bedrock envelope
  return {
    error: 'Malformed response without messageVersion or response wrapper',
    data: [1, 2, 3]
  };
};
