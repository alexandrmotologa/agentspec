#!/usr/bin/env node

// AgentSpec CLI entry point
import('../dist/cli/index.js').catch(err => {
  console.error('Failed to run AgentSpec CLI:', err);
  process.exit(1);
});
