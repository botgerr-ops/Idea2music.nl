// SQLite implementation of the D1 subset used by the Idea2Music handlers.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
export function openOrdersDb(filename=':memory:'){
 const db=new DatabaseSync(filename);
 db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
 if(filename!==':memory:')db.exec('PRAGMA journal_mode=WAL;');
 db.exec('CREATE TABLE IF NOT EXISTS _render_migrations (name TEXT PRIMARY KEY)');
 const dir=new URL('../migrations/',import.meta.url);
 for(const name of readdirSync(dir).filter(n=>/^\d+_.*\.sql$/.test(n)).sort()){
  if(db.prepare('SELECT name FROM _render_migrations WHERE name=?').get(name))continue;
  db.exec('BEGIN IMMEDIATE');
  try{db.exec(readFileSync(new URL(name,dir),'utf8'));db.prepare('INSERT INTO _render_migrations VALUES (?)').run(name);db.exec('COMMIT');}
  catch(e){db.exec('ROLLBACK');db.close();throw e;}
 }
 function prepare(sql,args=[]){
  return {bind(...values){return prepare(sql,values);},
   first(column){const row=db.prepare(sql).get(...args);return row?(column===undefined?{...row}:row[column]):null;},
   all(){return{success:true,results:db.prepare(sql).all(...args).map(row=>({...row}))};},
   run(){const result=db.prepare(sql).run(...args);return {success:true,meta:{changes:Number(result.changes),last_row_id:Number(result.lastInsertRowid)}};}};
 }
 return {prepare,batch(stmts){db.exec('BEGIN IMMEDIATE');try{const result=stmts.map(s=>s.run());db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}},close(){db.close();}};
}
