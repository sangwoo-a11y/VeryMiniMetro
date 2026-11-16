import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,nextHop,arrive,tick,connect} from '../simulation.js';
test('passengers find destinations across connecting lines',()=>{const g=createGame();assert.equal(nextHop(g,0,'square'),1);assert.equal(nextHop(g,1,'circle'),0);g.lines=[[],[],[]];assert.equal(nextHop(g,0,'square'),null);});
test('trains pick up, deliver, and transfer passengers',()=>{const g=createGame(),t=g.trains[0];g.stations[0].waiting=['square'];arrive(g,t,0,1);assert.deepEqual(t.passengers,['square']);arrive(g,t,2,1);assert.equal(g.score,1);assert.deepEqual(t.passengers,[]);t.passengers=['triangle'];arrive(g,t,3,2);assert.equal(g.stations[3].waiting.length,1);});
test('simulation runs a full week and expands without invalid train state',()=>{const g=createGame();g.stations[0].waiting=['square'];for(let i=0;i<1400;i++)tick(g,.1,()=>.01);assert.ok(g.score>0);assert.equal(g.stations.length,10);for(const t of g.trains){assert.ok(t.progress>=0&&t.progress<1);assert.ok(g.lines[t.line][t.index]!==undefined);}});
test('editing routes rejects duplicate stations and supports empty lines',()=>{const g=createGame();assert.equal(connect(g,0,0),false);g.lines[0]=[];assert.equal(connect(g,0,6),true);tick(g,1);assert.equal(connect(g,0,5),true);tick(g,1);assert.ok(Number.isFinite(g.trains[0].progress));});
