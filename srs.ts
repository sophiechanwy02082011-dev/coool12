export type Rating=1|2|3|4;
export type CardState={stability:number,difficulty:number,retrievability:number,reps:number,lapses:number,dueAt:Date,lastRating?:number,lastReviewedAt?:Date};
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
const W=[0.212,1.2931,2.3065,8.2956,6.4133,0.8334,3.0194,0.001,1.8722,0.1666,0.796,1.4835,0.0614,0.2629,1.6483,0.6014,1.8729,0.5425,0.0912,0.0658,0.1542];
function retrievability(elapsed:number,stability:number){const w20=W[20];const factor=Math.pow(0.9,-1/w20)-1;return Math.pow(1+factor*(elapsed/Math.max(stability,0.1)),-w20);}
export function schedule(card:CardState,rating:Rating,now=new Date(),desiredRetention=0.9):CardState{
  desiredRetention=clamp(desiredRetention,0.70,0.97);
  const elapsed=card.lastReviewedAt?Math.max(0,(now.getTime()-card.lastReviewedAt.getTime())/86400000):0;
  const R=card.lastReviewedAt?retrievability(elapsed,card.stability):1;
  let D=clamp(card.difficulty||5,1,10),S=Math.max(card.stability||0.3,0.3),reps=card.reps,lapses=card.lapses;
  if(reps===0){D=clamp(W[2]*(W[3]*(rating-4)+1),1,10);S=Math.max(0.3,W[0]*(W[1]*(rating-1)+1));reps=1;}
  else {
    const D0=W[2]*(-W[3]+1); const dRaw=D+W[4]*(rating-3); D=clamp(W[5]*D0+(1-W[5])*dRaw,1,10);
    if(rating===1){
      S=Math.max(0.2,W[10]*Math.pow(D,W[11])*Math.pow(S,W[12])*(Math.exp((1-R)*W[13])-1));
      lapses++; reps=0;
    } else {
      const inc=1+Math.exp(W[6])*Math.pow(D,W[7])*Math.pow(S,W[8])*(Math.exp((1-R)*W[9])-1);
      S=Math.max(S,S*inc); reps++;
    }
  }
  const nextDays=rating===1?Math.max(0.0208,S*0.02):Math.max(0.0417,S*(Math.log(desiredRetention)/Math.log(0.9)));
  return {...card,stability:S,difficulty:D,retrievability:R,reps,lapses,dueAt:new Date(now.getTime()+nextDays*86400000),lastRating:rating,lastReviewedAt:now};
}
export function due(cards:{dueAt:Date}[],now=new Date()){return cards.filter(c=>c.dueAt<=now);}
