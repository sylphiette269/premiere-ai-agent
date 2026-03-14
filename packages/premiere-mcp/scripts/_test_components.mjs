import { PremiereProBridge } from '../src/bridge/index.js';
const b = new PremiereProBridge();
await b.initialize();
const r = await b.executeScript(`return (function(){
  var info = __findClip('000f4271');
  if(!info) return JSON.stringify({error:'clip not found'});
  var clip = info.clip;
  var comps=[];
  for(var i=0;i<clip.components.numItems;i++){
    var c=clip.components[i];
    var props=[];
    for(var j=0;j<c.properties.numItems;j++) props.push(c.properties[j].displayName);
    comps.push({name:c.displayName,props:props});
  }
  return JSON.stringify({comps:comps});
})()`);
console.log(JSON.stringify(r, null, 2));
process.exit(0);
