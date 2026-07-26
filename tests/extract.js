function extractFn(src, name){
  const re=new RegExp("(?:async\\s+)?function\\s+"+name+"\\s*\\(");
  const m=src.match(re); if(!m) throw new Error("not found: "+name);
  const start=m.index;
  // find end of param list: from the '(' after name, match parens skipping strings
  let p=src.indexOf("(", start), pd=0, i=p;
  for(;i<src.length;i++){ const c=src[i];
    if(c==='"'||c==="'"||c==='`'){ const q=c; i++; while(i<src.length&&src[i]!==q){if(src[i]==='\\')i++;i++;} continue; }
    if(c==='(')pd++; else if(c===')'){ pd--; if(pd===0){ i++; break; } }
  }
  // now find body '{'
  let bodyStart=src.indexOf("{", i);
  let depth=0;
  for(i=bodyStart;i<src.length;i++){
    const c=src[i], n=src[i+1];
    if(c==='/'&&n==='/'){ i=src.indexOf("\n",i); if(i<0)i=src.length; continue; }
    if(c==='/'&&n==='*'){ i=src.indexOf("*/",i+2)+1; continue; }
    if(c==='"'||c==="'"){ i++; while(i<src.length&&src[i]!==c){ if(src[i]==='\\')i++; i++; } continue; }
    if(c==='`'){ i++; while(i<src.length){ if(src[i]==='\\'){i+=2;continue;} if(src[i]==='`')break; if(src[i]==='$'&&src[i+1]==='{'){ i+=2; let d=1; while(i<src.length&&d>0){ const cc=src[i]; if(cc==='{')d++; else if(cc==='}')d--; else if(cc==='`'){i++;while(i<src.length&&src[i]!=='`'){if(src[i]==='\\')i++;i++;}} else if(cc==='"'||cc==="'"){const q=cc;i++;while(i<src.length&&src[i]!==q){if(src[i]==='\\')i++;i++;}} if(d>0)i++; } continue; } i++; } continue; }
    if(c==='{')depth++;
    else if(c==='}'){ depth--; if(depth===0) return src.slice(start,i+1); }
  }
  throw new Error("unbalanced: "+name);
}
module.exports={extractFn};
