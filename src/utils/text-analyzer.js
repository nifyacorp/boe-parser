// Add a function to normalize prompts in the text analyzer or update the part where prompts are processed
function normalizePrompts(promptsInput) {
  let prompts = [];
  
  if (!promptsInput) return [];
  
  if (Array.isArray(promptsInput)) {
    prompts = promptsInput.filter(p => typeof p === 'string' && p.trim());
  } else if (typeof promptsInput === 'string') {
    // Try to parse as JSON if it looks like an array
    if (promptsInput.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(promptsInput);
        if (Array.isArray(parsed)) {
          prompts = parsed.filter(p => typeof p === 'string' && p.trim());
        } else {
          prompts = [promptsInput];
        }
      } catch (e) {
        // Not valid JSON, treat as single prompt
        prompts = [promptsInput];
      }
    } else {
      // Single prompt string
      prompts = [promptsInput.trim()];
    }
  }
  
  return prompts;
}

// Export the normalizePrompts function with other exports
module.exports = {
  normalizePrompts,
  // other existing exports...
}; 