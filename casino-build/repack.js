// Usage: node repack.js <bundlePath> <templatePath> <outPath>
const fs = require('fs');
const [, , bundlePath, templatePath, outPath] = process.argv;
const ESC = '<' + String.fromCharCode(92) + '/script>'; // <\/script>, shell-safe
function bounds(html){
  const open='<script type="__bundler/template">';
  const i=html.indexOf(open); if(i<0) throw new Error('no open');
  const start=i+open.length; const end=html.indexOf('</script>',start);
  if(end<0) throw new Error('no close'); return {start,end};
}
const html=fs.readFileSync(bundlePath,'utf8');
const newTpl=fs.readFileSync(templatePath,'utf8');
const {start,end}=bounds(html);
const encoded=JSON.stringify(newTpl).split('</script>').join(ESC);
const out=html.slice(0,start)+encoded+html.slice(end);
fs.writeFileSync(outPath,out);
const v=fs.readFileSync(outPath,'utf8'); const b=bounds(v);
const back=JSON.parse(v.slice(b.start,b.end));
console.log('repack OK | semantic match:',back===newTpl,'| out bytes:',out.length);
if(back!==newTpl) process.exit(1);
