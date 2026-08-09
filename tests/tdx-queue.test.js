const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

test('admin login status returns queue status', async () => {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: '4175',
      TDX_FETCH_ENABLED: 'false'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  const waitForServer = async () => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      try {
        const response = await fetch('http://127.0.0.1:4175/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: 'admin', password: '7766' })
        });
        if (response.ok) return response;
      } catch (error) {
        // server still starting up
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Server did not start in time.\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
  };

  try {
    const response = await waitForServer();
    const payload = await response.json();
    assert.equal(payload.success, true);
    assert.ok(payload.queueStatus, 'queueStatus should be present');
    assert.equal(typeof payload.queueStatus.pendingCount, 'number');
    assert.equal(typeof payload.queueStatus.activeCount, 'number');
    assert.equal(typeof payload.queueStatus.processedCount, 'number');
  } finally {
    child.kill('SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
});
