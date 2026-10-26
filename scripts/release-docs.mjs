/** Render current installation references without rewriting historical evidence. */
export const RELEASE_DOCUMENT_RENDERER='cb-release-docs-1';
export const RELEASE_DOCUMENTS=Object.freeze({
  'docs/installation.md':'docs/installation.md',
  'docs/user-guide.md':'docs/user-guide.md',
  'repair.html':'public/repair.html',
  'repair/index.html':'public/repair.html'
});

const versionPattern='\\d+\\.\\d+\\.\\d+(?:-[A-Za-z0-9-]+(?:\\.[A-Za-z0-9-]+)*)?(?:\\+[A-Za-z0-9-]+(?:\\.[A-Za-z0-9-]+)*)?';
const safeVersion=new RegExp('^'+versionPattern+'$');
const placeholder=/\{\{([^{}\r\n]+)\}\}/g;

function assertVersion(version){
  if(typeof version!=='string'||version.length>64||!safeVersion.test(version))throw new Error('Release documentation requires a safe semantic version.');
}

function sections(source,fileName){
  if(typeof source!=='string')throw new TypeError(fileName+': documentation must be text.');
  const sections=[],markers=/<!--\s*release-history:([^>]*?)\s*-->/g;
  let historical=false,offset=0;
  for(const match of source.matchAll(markers)){
    sections.push({text:source.slice(offset,match.index),historical});
    const directive=match[1].trim();
    if(directive==='start'){
      if(historical)throw new Error(fileName+': nested release-history sections are not allowed.');
      historical=true;
    }else if(directive==='end'){
      if(!historical)throw new Error(fileName+': release-history end has no matching start.');
      historical=false;
    }else throw new Error(fileName+': unknown release-history directive: '+directive);
    sections.push({text:match[0],historical:true});
    offset=match.index+match[0].length;
  }
  if(historical)throw new Error(fileName+': release-history section has no matching end.');
  sections.push({text:source.slice(offset),historical:false});
  return sections;
}

function currentReferences(text){
  const patterns=[
    ['archive',new RegExp('\\bCircuitBench-('+versionPattern+')-(?:deploy|source)\\.zip\\b','g')],
    ['runtime directory',new RegExp('\\bassets/('+versionPattern+')/','g')],
    ['service worker',new RegExp('\\bsw-('+versionPattern+')\\.js\\b','g')],
    ['repair URL',/\brepair\/\?release=([A-Za-z0-9.+%_-]+)/g],
    ['visible version',new RegExp('\\bv('+versionPattern+')(?![A-Za-z0-9_+-])','g')]
  ];
  const refs=[];
  for(const [kind,pattern]of patterns)for(const match of text.matchAll(pattern)){
    let version=match[1];
    if(kind==='repair URL'){
      try{version=decodeURIComponent(version);}catch{throw new Error('Invalid encoded release version in repair URL.');}
    }
    refs.push({kind,version,text:match[0]});
  }
  return refs;
}

/** Reject stale operational references; historical prose/evidence identities stay literal. */
export function validateReleaseDocument(document,version,fileName='Release document'){
  assertVersion(version);
  const parts=sections(document,fileName);
  for(const part of parts){
    if(/\{\{[A-Za-z_][A-Za-z0-9_\s]*\}\}/.test(part.text))throw new Error(fileName+': unresolved release-document placeholder.');
    if(part.historical)continue;
    for(const reference of currentReferences(part.text)){
      if(reference.version!==version)throw new Error(fileName+': stale '+reference.kind+' reference '+reference.text+'; expected '+version+'. Mark genuine historical examples explicitly.');
    }
  }
  return true;
}

/** Pure, deterministic transform. The build records both source and renderer hashes. */
export function renderReleaseDocument(source,version,fileName='Release document'){
  assertVersion(version);
  const values={RELEASE_VERSION:version,RELEASE_QUERY_VERSION:encodeURIComponent(version)};
  let substitutions=0;
  const rendered=sections(source,fileName).map(part=>part.text.replace(placeholder,(whole,name)=>{
    if(part.historical)throw new Error(fileName+': release placeholders are not allowed in historical sections.');
    const key=name.trim();
    if(!Object.hasOwn(values,key))throw new Error(fileName+': unknown release-document placeholder '+whole+'.');
    substitutions++;
    return values[key];
  })).join('');
  if(!substitutions)throw new Error(fileName+': selected release-document template has no release placeholders.');
  validateReleaseDocument(rendered,version,fileName);
  return rendered;
}
