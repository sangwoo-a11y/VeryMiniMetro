export const COLORS=['#de6657','#528caf','#d5b44d'];
const initial=[['circle',205,170,'서대문'],['triangle',425,115,'종로'],['square',700,160,'동대문'],['circle',890,255,'성수'],['triangle',760,440,'강남'],['circle',480,430,'용산'],['square',270,400,'여의도']];
const extra=[['triangle',100,290,'마포'],['square',580,235,'을지로'],['circle',950,440,'잠실'],['triangle',360,270,'서울역'],['square',590,510,'서초']];
export function createGame(){return {stations:initial.map(([shape,x,y,name],id)=>({id,shape,x,y,name,waiting:[],crowded:0})),lines:[[0,1,2],[2,3,4],[4,5,6]],trains:COLORS.map((_,line)=>({line,index:0,direction:1,progress:0,passengers:[]})),score:0,elapsed:0,spawn:0,expansion:0,week:1};}
export function nextHop(game,start,targetShape){
 const seen=new Set([start]),queue=[[start,null]];
 while(queue.length){const [id,first]=queue.shift();if(id!==start&&game.stations[id].shape===targetShape)return first;
  for(const line of game.lines){for(let i=0;i<line.length;i++){if(line[i]!==id)continue;for(const next of [line[i-1],line[i+1]]){if(next!==undefined&&!seen.has(next)){seen.add(next);queue.push([next,first??next]);}}}}
 }return null;
}
export function arrive(game,train,id,next){const station=game.stations[id];const staying=[];for(const p of train.passengers){if(p===station.shape)game.score++;else if(nextHop(game,id,p)!==next)station.waiting.push(p);else staying.push(p);}train.passengers=staying;station.waiting=station.waiting.filter(p=>{if(train.passengers.length<6&&nextHop(game,id,p)===next){train.passengers.push(p);return false;}return true;});}
export function tick(game,dt,random=Math.random){
 game.elapsed+=dt;game.spawn+=dt;game.expansion+=dt;
 if(game.spawn>=3){game.spawn-=3;const station=game.stations[Math.floor(random()*game.stations.length)];const choices=['circle','triangle','square'].filter(x=>x!==station.shape);if(station.waiting.length<24)station.waiting.push(choices[Math.floor(random()*choices.length)]);}
 if(game.expansion>=45&&game.stations.length<12){game.expansion=0;const [shape,x,y,name]=extra[game.stations.length-7];game.stations.push({id:game.stations.length,shape,x,y,name,waiting:[],crowded:0});}
 for(const station of game.stations)station.crowded=Math.max(0,station.crowded+(station.waiting.length>=8?dt:-dt*2));
 for(const train of game.trains){const line=game.lines[train.line];if(line.length<2)continue;if(train.index>=line.length)train.index=0;if(train.index+train.direction<0||train.index+train.direction>=line.length)train.direction*=-1;
 const from=game.stations[line[train.index]],to=game.stations[line[train.index+train.direction]];
 if(train.progress===0)arrive(game,train,from.id,to.id);
 train.progress+=dt*65/Math.hypot(to.x-from.x,to.y-from.y);
 if(train.progress>=1){train.progress=0;train.index+=train.direction;}
 }
}
export function connect(game,lineId,id){const line=game.lines[lineId];if(line.includes(id))return false;line.push(id);return true;}
