// Recovery needs real PostgreSQL advisory locks, which PGlite does not implement.
import assert from 'node:assert/strict';
import pg from 'pg';
import {TRAINING_LOCK,createTrainingJob,recoverTrainingJobs,latestTrainingJob,failTrainingJob} from './src/lib/product-training-jobs.ts';
if(process.env.COMPOSE_SMOKE_TEST !== '1') throw new Error('Isolated CI database only');
const pool = new pg.Pool({connectionString:process.env.DATABASE_URL,max:4});
const sql={query:async(text,params)=>(await pool.query(text,params)).rows};
const owner=await pool.connect();
const trainer=await pool.connect();
try {
  const jobs=await Promise.all(Array.from({length:5},()=>createTrainingJob(sql)));
  assert.equal(jobs.filter(j=>j.created).length,1);
  assert.equal(new Set(jobs.map(j=>j.job.id)).size,1);
  const id=jobs[0].job.id;
  await owner.query('select pg_advisory_lock_shared($1)',[TRAINING_LOCK]);
  await trainer.query('select pg_advisory_lock_shared($1)',[TRAINING_LOCK]);
  await sql.query("update product_training_jobs set status='running',updated_at=now()-interval '5 minutes' where id=$1",[id]);
  await recoverTrainingJobs(sql);
  assert.equal((await latestTrainingJob(sql)).status,'running','Never reclaim a live worker');
  await owner.query('select pg_advisory_unlock_shared($1)',[TRAINING_LOCK]);
  await recoverTrainingJobs(sql);
  assert.equal((await latestTrainingJob(sql)).status,'running','Trainer survives coordinator loss');
  await trainer.query('select pg_advisory_unlock_shared($1)',[TRAINING_LOCK]);
  await recoverTrainingJobs(sql);
  assert.equal((await latestTrainingJob(sql)).status,'failed','Recover interrupted work');
  const next=await createTrainingJob(sql);
  assert.equal(next.created,true);
  await recoverTrainingJobs(sql);
  assert.equal((await latestTrainingJob(sql)).status,'queued','Allow time for worker startup');
  await failTrainingJob(sql,next.job.id);
  console.log('PostgreSQL training jobs: single job, live lock protection, interrupted recovery OK');
} finally {owner.release();trainer.release();await pool.end();}
