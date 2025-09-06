const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const copyFrom = require('pg-copy-streams').from;

const pool = new Pool({
  user: process.env.PGUSER || 'youruser',
  host: process.env.PGHOST || 'postgres',
  database: process.env.PGDATABASE || 'yourdb',
  password: process.env.PGPASSWORD || 'yourpassword',
  port: process.env.PGPORT ? parseInt(process.env.PGPORT) : 5432,
});

// Wait for database to be ready
async function waitForDatabase() {
  const maxRetries = 30;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      console.log('✅ Database connection established');
      return;
    } catch (err) {
      console.log(`⏳ Waiting for database... (${i + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  throw new Error('Could not connect to database after 30 attempts');
}

const TOTAL_USERS = 100_000_000;
const BATCH_SIZE = 10_000; // Much smaller batches to prevent memory issues
const CONCURRENCY = 100; // More concurrent connections with smaller batches

function randomState() {
  const states = ['active', 'inactive', 'pending'];
  return states[Math.floor(Math.random() * states.length)];
}

function randomPhone() {
  return String(Math.floor(Math.random() * 1e10)).padStart(10, '0');
}

function randomPassword() {
  return Math.random().toString(36).slice(-8);
}

async function insertBatch(start, end) {
  const client = await pool.connect();
  try {
    // Use COPY for faster bulk inserts
    const userValues = [];
    const userIds = [];
    
    for (let i = start; i <= end; i++) {
      const id = uuidv4();
      userIds.push(id);
      userValues.push(`${id}\tUser_${i}\tuser_${i}@example.com\t${randomPassword()}\t${randomPhone()}\t${randomState()}`);
    }

    // Bulk insert users using COPY
    const userCopyQuery = `COPY users (id, name, email, password, phoneNumber, state) FROM STDIN WITH DELIMITER '\t'`;
    const userStream = client.query(copyFrom(userCopyQuery));
    userStream.write(userValues.join('\n'));
    userStream.end();
    await new Promise((resolve, reject) => {
      userStream.on('finish', resolve);
      userStream.on('error', reject);
    });

    // Bulk insert posts using COPY
    const postValues = [];
    for (let i = 0; i < userIds.length; i++) {
      for (let p = 1; p <= 2; p++) {
        const randomDate = new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString();
        postValues.push(`${userIds[i]}\tPost_${p}\tDescription for post ${p}\t${randomDate}\t${Math.floor(Math.random() * 1000)}`);
      }
    }
    
    const postCopyQuery = `COPY posts (user_id, name, description, date, numberoflike) FROM STDIN WITH DELIMITER '\t'`;
    const postStream = client.query(copyFrom(postCopyQuery));
    postStream.write(postValues.join('\n'));
    postStream.end();
    await new Promise((resolve, reject) => {
      postStream.on('finish', resolve);
      postStream.on('error', reject);
    });

    console.log(`📊 Batch ${Math.ceil(start / BATCH_SIZE)} completed: Inserted ${end - start + 1} users (${start}-${end}) and ${(end - start + 1) * 2} posts`);
  } catch (err) {
    console.error(`❌ Error in batch ${Math.ceil(start / BATCH_SIZE)}:`, err.message);
  } finally {
    client.release();
  }
}

async function main() {
  console.log('🚀 Starting bulk insert process...');
  console.log(`📈 Target: ${TOTAL_USERS.toLocaleString()} users, ${(TOTAL_USERS * 2).toLocaleString()} posts`);
  console.log(`⚙️  Config: ${BATCH_SIZE.toLocaleString()} users per batch, ${CONCURRENCY} concurrent batches\n`);
  
  const startTime = Date.now();
  await waitForDatabase();
  
  let batchStart = 1;
  const promises = [];
  const totalBatches = Math.ceil(TOTAL_USERS / BATCH_SIZE);
  let completedBatches = 0;
  
  while (batchStart <= TOTAL_USERS) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE - 1, TOTAL_USERS);
    promises.push(insertBatch(batchStart, batchEnd).then(() => {
      completedBatches++;
      const progress = ((completedBatches / totalBatches) * 100).toFixed(1);
      const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
      console.log(`📋 Progress: ${completedBatches}/${totalBatches} batches (${progress}%) - ${elapsed}min elapsed`);
    }));
    
    if (promises.length >= CONCURRENCY) {
      await Promise.all(promises);
      promises.length = 0;
    }
    batchStart = batchEnd + 1;
  }
  
  if (promises.length) await Promise.all(promises);
  
  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n🎉 Bulk insert completed successfully!`);
  console.log(`⏱️  Total time: ${totalTime} minutes`);
  console.log(`📊 Final count: ${TOTAL_USERS.toLocaleString()} users, ${(TOTAL_USERS * 2).toLocaleString()} posts`);
  
  await pool.end();
}

main();
