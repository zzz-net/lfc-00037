import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn, ChildProcess } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '..', 'api', 'data', 'db.json');
const DB_BACKUP_PATH = path.join(__dirname, '..', 'api', 'data', 'db.json.backup');
const TEST_PORT = 3005;

console.log('='.repeat(80));
console.log('  批量操作幂等性 - 自动化回归测试 V2');
console.log('  流程：备份数据 → 清理测试数据 → 启动测试服务器 → 运行测试 → 恢复数据');
console.log('='.repeat(80));

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function backupDb(): void {
  if (fs.existsSync(DB_PATH)) {
    fs.copyFileSync(DB_PATH, DB_BACKUP_PATH);
    console.log('\n✓ 已备份 db.json 到 db.json.backup');
  }
}

function restoreDb(): void {
  if (fs.existsSync(DB_BACKUP_PATH)) {
    fs.copyFileSync(DB_BACKUP_PATH, DB_PATH);
    fs.unlinkSync(DB_BACKUP_PATH);
    console.log('✓ 已恢复原始 db.json');
  }
}

function clearTestData(): void {
  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  const originalCount = db.batchOperations?.length || 0;
  db.batchOperations = [];
  if (db.timelineEvents) {
    const originalTimeline = db.timelineEvents.length;
    db.timelineEvents = db.timelineEvents.filter((e: any) => 
      !e.content?.includes('[批量幂等V2]') && 
      !e.content?.includes('batchId:') &&
      !e.type?.startsWith('batch_')
    );
    console.log(`✓ 清理时间线：${originalTimeline} → ${db.timelineEvents.length} 条`);
  }
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  console.log(`✓ 已清理 batchOperations 表（原 ${originalCount} 条）`);
}

function startServer(): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const isWin = process.platform === 'win32';
    const server = spawn(isWin ? 'cmd.exe' : 'npx', isWin ? ['/c', 'npx', 'tsx', 'api/server.ts'] : ['tsx', 'api/server.ts'], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, PORT: String(TEST_PORT) },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let serverReady = false;
    let serverOutput = '';

    server.stdout?.on('data', (data) => {
      const output = data.toString();
      serverOutput += output;
      process.stdout.write(output);
      if (output.includes(`Server ready on port ${TEST_PORT}`) || output.includes(`port ${TEST_PORT}`)) {
        if (!serverReady) {
          serverReady = true;
          setTimeout(() => resolve(server), 1000);
        }
      }
    });

    server.stderr?.on('data', (data) => {
      const output = data.toString();
      serverOutput += output;
      process.stderr.write(output);
      if (output.includes('EADDRINUSE') && !serverReady) {
        reject(new Error(`端口 ${TEST_PORT} 被占用: ${output}`));
      }
    });

    server.on('error', (err) => {
      if (!serverReady) reject(err);
    });

    setTimeout(() => {
      if (!serverReady) {
        reject(new Error(`服务器启动超时，输出：${serverOutput.slice(-500)}`));
      }
    }, 15000);
  });
}

function runTests(port: number): Promise<number> {
  return new Promise((resolve) => {
    const isWin = process.platform === 'win32';
    const testProcess = spawn(isWin ? 'cmd.exe' : 'npx', isWin ? ['/c', 'npx', 'tsx', 'scripts/test-batch-idempotency-v2.ts'] : ['tsx', 'scripts/test-batch-idempotency-v2.ts'], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, TEST_PORT: String(port) },
      stdio: 'inherit',
    });

    testProcess.on('exit', (code) => {
      resolve(code || 0);
    });
  });
}

async function main(): Promise<number> {
  let server: ChildProcess | null = null;
  let exitCode = 0;

  try {
    backupDb();
    clearTestData();

    console.log(`\n▶ 启动测试服务器（端口 ${TEST_PORT}）...`);
    server = await startServer();
    console.log(`✓ 服务器已启动，PID: ${server.pid}`);

    await sleep(1000);

    console.log('\n▶ 运行回归测试...');
    exitCode = await runTests(TEST_PORT);

    console.log(`\n✓ 测试完成，退出码: ${exitCode}`);
  } catch (err) {
    console.error('\n❌ 测试流程失败:', err);
    exitCode = 1;
  } finally {
    if (server && server.pid) {
      console.log(`\n▶ 停止测试服务器（PID: ${server.pid}）...`);
      try {
        process.kill(server.pid);
        await sleep(1000);
      } catch (e) {
        console.log('  服务器进程可能已停止');
      }
    }
    restoreDb();
  }

  console.log('\n' + '='.repeat(80));
  console.log(exitCode === 0 ? '  ✓ 全部流程完成，测试通过！' : '  ✗ 测试流程完成，但存在失败');
  console.log('='.repeat(80));

  return exitCode;
}

main().then(process.exit).catch(() => process.exit(1));
