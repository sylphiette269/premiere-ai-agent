(function (global) {
  "use strict";

  var core = global.__PR_MCP_PANEL_CORE__;

  if (!core) {
    throw new Error("panel-core.js must load before panel-scripts.js");
  }

  function esJsonHelpers() {
    return "function __escapeJsonString(value){var str=String(value);var out='\"';for(var i=0;i<str.length;i++){var code=str.charCodeAt(i);var ch=str.charAt(i);if(code===34){out+='\\\\\"';}else if(code===92){out+='\\\\\\\\';}else if(code===8){out+='\\\\b';}else if(code===9){out+='\\\\t';}else if(code===10){out+='\\\\n';}else if(code===12){out+='\\\\f';}else if(code===13){out+='\\\\r';}else if(code<32||code>126){var hex=code.toString(16);out+='\\\\u'+('0000'+hex).slice(-4);}else{out+=ch;}}out+='\"';return out;}function __toJson(value){if(value===null)return'null';var type=typeof value;if(type==='string')return __escapeJsonString(value);if(type==='number')return isFinite(value)?String(value):'null';if(type==='boolean')return value?'true':'false';if(type==='undefined'||type==='function')return'null';if(value instanceof Array){var arrayParts=[];for(var i=0;i<value.length;i++){var entry=value[i];var entryType=typeof entry;arrayParts.push(__toJson(entryType==='undefined'||entryType==='function'?null:entry));}return'['+arrayParts.join(',')+']';}var objectParts=[];for(var key in value){if(value.hasOwnProperty&&!value.hasOwnProperty(key))continue;var item=value[key];var itemType=typeof item;if(itemType==='undefined'||itemType==='function')continue;objectParts.push(__escapeJsonString(key)+':'+__toJson(item));}return'{'+objectParts.join(',')+'}';}";
  }

  function esWrap(body) {
    return "(function(){" + esJsonHelpers() + body + "})()";
  }

  function buildReadCommandScript(filePath) {
    return core.readScript(filePath);
  }

  function buildChooseProjectScript() {
    return "(function(){try{var f=File.openDialog('Select Premiere project','*.prproj');if(!f)return JSON.stringify({ok:false,cancelled:true});return JSON.stringify({ok:true,path:String(f.fsName||f.fullName||'')});}catch(e){return JSON.stringify({ok:false,error:String(e)});}})()";
  }

  function buildBringHostToFrontScript() {
    return "(function(){try{if(typeof BridgeTalk==='undefined'||!BridgeTalk||typeof BridgeTalk.bringToFront!=='function'){return JSON.stringify({ok:false,error:'bridgetalk_unavailable'});}var appName=(BridgeTalk.appName&&String(BridgeTalk.appName))?String(BridgeTalk.appName):'premierepro';var specifier=(typeof BridgeTalk.getSpecifier==='function')?BridgeTalk.getSpecifier(appName):null;BridgeTalk.bringToFront(specifier||appName);return JSON.stringify({ok:true,app:specifier||appName});}catch(e){return JSON.stringify({ok:false,error:String(e)});}})()";
  }

  function createSequencePrelude(cmd) {
    var params = cmd.params || {};
    return "var id=" + core.quoteEs(cmd.id || "") + ";" +
      "var name=" + core.quoteEs(String(params.name || "")) + ";" +
      "var requestedPresetPath=" + core.quoteEs(core.normPath(params.presetPath || "")) + ";" +
      "var requestedMediaPath=" + core.quoteEs(core.normPath(params.mediaPath || "")) + ";" +
      "var generatedSequenceId='mcp-seq-'+(new Date().getTime())+'-'+Math.floor(Math.random()*1000000);" +
      "var presetPath='';var usedPresetPath='';var creationMode='';var attemptedCreationMode='';" +
      "function normalizePath(value){return String(value||'').split('\\\\').join('/');}" +
      "function resolveExistingFilePath(filePath){if(!filePath)return '';if(typeof File==='undefined')return '';var fileRef=new File(filePath);if(!fileRef.exists)return '';if(fileRef.fsName)return normalizePath(String(fileRef.fsName));return normalizePath(String(filePath));}" +
      "function joinWindowsPath(basePath,suffix){var normalized=String(basePath||'');while(normalized.length&&(/[\\\\\\/]/).test(normalized.charAt(normalized.length-1))){normalized=normalized.substring(0,normalized.length-1);}if(!normalized)return suffix;return normalizePath(normalized)+'/'+suffix;}" +
      "function resolvePresetPath(){var candidates=[];if(requestedPresetPath)candidates.push(requestedPresetPath);var appPath='';try{appPath=String(app.path||'');}catch(_ignored){}if(appPath){candidates.push(joinWindowsPath(appPath,'Settings/SequencePresets/Digital SLR/1080p/DSLR 1080p25.sqpreset'));candidates.push(joinWindowsPath(appPath,'Settings/SequencePresets/AVCHD/1080p/AVCHD 1080p25.sqpreset'));candidates.push(joinWindowsPath(appPath,'Settings/SequencePresets/Digital SLR/1080p/DSLR 1080p30.sqpreset'));candidates.push(joinWindowsPath(appPath,'Settings/SequencePresets/AVCHD/1080p/AVCHD 1080p30.sqpreset'));candidates.push(joinWindowsPath(appPath,'Settings/SequencePresets/Digital SLR/1080p/DSLR 1080p24.sqpreset'));candidates.push(joinWindowsPath(appPath,'Settings/SequencePresets/AVCHD/1080p/AVCHD 1080p24.sqpreset'));candidates.push(joinWindowsPath(appPath,'Settings/SequencePresets/Digital SLR/1080p/DSLR 1080p2997.sqpreset'));candidates.push(joinWindowsPath(appPath,'Settings/SequencePresets/AVCHD/1080p/AVCHD 1080p2997.sqpreset'));candidates.push(joinWindowsPath(appPath,'Settings/SequencePresets/Digital SLR/720p/DSLR 720p25.sqpreset'));candidates.push(joinWindowsPath(appPath,'Settings/SequencePresets/Digital SLR/720p/DSLR 720p30.sqpreset'));candidates.push(joinWindowsPath(appPath,'Settings/SequencePresets/HD 1080p/HD 1080p 25 fps.sqpreset'));candidates.push(joinWindowsPath(appPath,'Settings/SequencePresets/HD 1080p/HD 1080p 29.97 fps.sqpreset'));candidates.push(joinWindowsPath(appPath,'Settings/SequencePresets/HD 1080p/HD 1080p 23.976 fps.sqpreset'));candidates.push(joinWindowsPath(appPath,'Settings/SequencePresets/HD 1080p/HD 1080p 50 fps.sqpreset'));candidates.push(joinWindowsPath(appPath,'Settings/SequencePresets/HD 1080p/HD 1080p 59.94 fps.sqpreset'));}for(var i=0;i<candidates.length;i++){var resolved=resolveExistingFilePath(candidates[i]);if(resolved)return resolved;}return '';}" +
      "function getSequenceCount(){var sequences=app.project&&app.project.sequences;if(!sequences)return 0;if(typeof sequences.numSequences==='number')return sequences.numSequences;if(typeof sequences.length==='number')return sequences.length;return 0;}" +
      "function findSequence(targetName,targetSequenceId){var sequences=app.project&&app.project.sequences;if(!sequences)return null;var total=getSequenceCount();for(var i=0;i<total;i++){var candidate=sequences[i];if(!candidate)continue;if(targetSequenceId&&candidate.sequenceID===targetSequenceId)return candidate;if(candidate.name===targetName)return candidate;}return null;}" +
      "function collectSequenceNames(limit){var sequences=app.project&&app.project.sequences;var names=[];if(!sequences)return names;var total=getSequenceCount();for(var i=0;i<total&&i<limit;i++){var candidate=sequences[i];if(candidate&&candidate.name)names.push(String(candidate.name));}return names;}" +
      "function findProjectItemByMediaPath(folder,targetPath){if(!folder||!folder.children)return null;var binType=(typeof ProjectItemType!=='undefined'&&ProjectItemType&&ProjectItemType.BIN!==undefined)?ProjectItemType.BIN:2;for(var i=0;i<folder.children.numItems;i++){var item=folder.children[i];if(!item)continue;if(item.getMediaPath&&normalizePath(item.getMediaPath())===normalizePath(targetPath))return item;if(item.type===binType){var nested=findProjectItemByMediaPath(item,targetPath);if(nested)return nested;}}return null;}";
  }

  function createSequenceConfirmPrelude(cmd) {
    return createSequencePrelude(cmd).replace(
      "var generatedSequenceId='mcp-seq-'+(new Date().getTime())+'-'+Math.floor(Math.random()*1000000);",
      "",
    );
  }

  function buildCreateSequenceSupportScript(cmd) {
    return esWrap("try{if(!app.project)return __toJson({ok:false,error:'no_project',id:" + core.quoteEs(cmd.id || "") + "});" +
      createSequencePrelude(cmd) +
      "presetPath=resolvePresetPath();var hasEnableQE=!!(app.enableQE&&typeof app.enableQE==='function');var hasQeProjectNewSequence=false;if(hasEnableQE){try{app.enableQE();hasQeProjectNewSequence=!!(typeof qe!=='undefined'&&qe&&qe.project&&qe.project.newSequence);}catch(_qeSupportError){hasQeProjectNewSequence=false;}}" +
      "return __toJson({ok:true,presetPath:presetPath,hasEnableQE:hasEnableQE,hasQeProjectNewSequence:hasQeProjectNewSequence,hasProjectNewSequence:!!(app.project&&app.project.newSequence),hasProjectCreateNewSequence:!!(app.project&&app.project.createNewSequence),hasProjectCreateNewSequenceFromClips:!!(app.project&&app.project.createNewSequenceFromClips),id:id});" +
      "}catch(error){return __toJson({ok:false,error:'resolve_create_sequence_support_exception',details:String(error),id:" + core.quoteEs(cmd.id || "") + "});}");
  }

  function buildCreateSequenceAttemptScript(cmd, mode, supportPresetPath) {
    var attemptMode = String(mode || "");
    var presetLiteral = core.quoteEs(String(supportPresetPath || ""));

    if (attemptMode === "createNewSequenceFromClips") {
      return esWrap("try{if(!app.project)return __toJson({ok:false,error:'no_project',id:" + core.quoteEs(cmd.id || "") + "});" +
        createSequencePrelude(cmd) +
        "function findFirstItem(folder){if(!folder||!folder.children)return null;var ct=(typeof ProjectItemType!=='undefined'&&ProjectItemType&&ProjectItemType.CLIP!==undefined)?ProjectItemType.CLIP:1;var bt=(typeof ProjectItemType!=='undefined'&&ProjectItemType&&ProjectItemType.BIN!==undefined)?ProjectItemType.BIN:2;for(var i=0;i<folder.children.numItems;i++){var it=folder.children[i];if(!it)continue;if(it.type===ct)return it;if(it.type===bt){var n=findFirstItem(it);if(n)return n;}}return null;}" +
        "var sourceItem=requestedMediaPath?findProjectItemByMediaPath(app.project.rootItem,requestedMediaPath):findFirstItem(app.project.rootItem);if(!sourceItem)return __toJson({ok:false,error:'media_not_found',mediaPath:requestedMediaPath,id:id});" +
        "if(!app.project.createNewSequenceFromClips)return __toJson({ok:false,error:'sequence_from_clips_api_unavailable',id:id});" +
        "attemptedCreationMode='createNewSequenceFromClips';creationMode='createNewSequenceFromClips';app.project.createNewSequenceFromClips(name,[sourceItem],app.project.rootItem);" +
        "return __toJson({ok:true,mode:'createNewSequenceFromClips',id:id});" +
        "}catch(error){return __toJson({ok:false,error:'sequence_from_clips_exception',details:String(error),id:" + core.quoteEs(cmd.id || "") + "});}");
    }

    if (attemptMode === "qe.project.newSequence") {
      return esWrap("try{if(!app.project)return __toJson({ok:false,error:'no_project',id:" + core.quoteEs(cmd.id || "") + "});" +
        createSequencePrelude(cmd) +
        "presetPath=" + presetLiteral + ";if(!presetPath)return __toJson({ok:false,error:'sequence_preset_not_found',id:id});" +
        "if(!app.enableQE||typeof app.enableQE!=='function')return __toJson({ok:false,error:'qe_sequence_api_unavailable',id:id});app.enableQE();" +
        "if(typeof qe==='undefined'||!qe||!qe.project||!qe.project.newSequence)return __toJson({ok:false,error:'qe_sequence_api_unavailable',id:id});" +
        "attemptedCreationMode='qe.project.newSequence';creationMode='qe.project.newSequence';usedPresetPath=presetPath;qe.project.newSequence(name,presetPath);" +
        "return __toJson({ok:true,mode:'qe.project.newSequence',id:id});" +
        "}catch(error){return __toJson({ok:false,error:'qe_sequence_exception',details:String(error),id:" + core.quoteEs(cmd.id || "") + "});}");
    }

    if (attemptMode === "newSequence") {
      return esWrap("try{if(!app.project)return __toJson({ok:false,error:'no_project',id:" + core.quoteEs(cmd.id || "") + "});" +
        createSequencePrelude(cmd) +
        "presetPath=" + presetLiteral + ";if(!presetPath)return __toJson({ok:false,error:'sequence_preset_not_found',id:id});" +
        "if(!app.project.newSequence)return __toJson({ok:false,error:'new_sequence_api_unavailable',id:id});" +
        "attemptedCreationMode='newSequence';creationMode='newSequence';usedPresetPath=presetPath;app.project.newSequence(name,presetPath);" +
        "return __toJson({ok:true,mode:'newSequence',id:id});" +
        "}catch(error){return __toJson({ok:false,error:'new_sequence_exception',details:String(error),id:" + core.quoteEs(cmd.id || "") + "});}");
    }

    return esWrap("try{if(!app.project)return __toJson({ok:false,error:'no_project',id:" + core.quoteEs(cmd.id || "") + "});" +
      createSequencePrelude(cmd) +
      "if(!app.project.createNewSequence)return __toJson({ok:false,error:'create_new_sequence_api_unavailable',id:id});" +
      "attemptedCreationMode='createNewSequence';creationMode='createNewSequence';app.project.createNewSequence(name,generatedSequenceId);" +
      "return __toJson({ok:true,mode:'createNewSequence',generatedSequenceId:generatedSequenceId,id:id});" +
      "}catch(error){return __toJson({ok:false,error:'create_new_sequence_exception',details:String(error),id:" + core.quoteEs(cmd.id || "") + "});}");
  }

  function buildCreateSequenceConfirmScript(cmd, mode, supportPresetPath) {
    var usedPresetPath = (mode === "qe.project.newSequence" || mode === "newSequence")
      ? String(supportPresetPath || "")
      : "";

    return esWrap("try{if(!app.project)return __toJson({ok:false,error:'no_project',id:" + core.quoteEs(cmd.id || "") + "});" +
      createSequenceConfirmPrelude(cmd) +
      "creationMode=" + core.quoteEs(mode || "") + ";attemptedCreationMode=" + core.quoteEs(mode || "") + ";usedPresetPath=" + core.quoteEs(usedPresetPath) + ";" +
      "var createdSequence=null;var creationErrors=[];var activeSequence=app.project.activeSequence;for(var attempt=0;attempt<30;attempt++){if(activeSequence&&activeSequence.name===name)break;createdSequence=createdSequence||findSequence(name,'');if(createdSequence){if(app.project.openSequence&&createdSequence.sequenceID){try{app.project.openSequence(createdSequence.sequenceID);}catch(_openIgnored){}}activeSequence=app.project.activeSequence||createdSequence;if(activeSequence&&activeSequence.name===name)break;}if(typeof $!=='undefined'&&$.sleep)$.sleep(100);activeSequence=app.project.activeSequence;}if(!activeSequence||activeSequence.name!==name){createdSequence=createdSequence||findSequence(name,'');return __toJson({ok:false,error:(createdSequence?'sequence_not_activated':'created_sequence_not_found'),sequenceName:name,requestedPresetPath:requestedPresetPath,presetPath:usedPresetPath,activeSequenceName:(activeSequence&&activeSequence.name)?String(activeSequence.name):'',sequenceCount:getSequenceCount(),sequenceNames:collectSequenceNames(10),mode:(creationMode||attemptedCreationMode),creationErrors:creationErrors,id:id});}" +
      "return __toJson({ok:true,sequenceName:(activeSequence&&activeSequence.name)?String(activeSequence.name):name,requestedPresetPath:requestedPresetPath,presetPath:usedPresetPath,mode:(creationMode||attemptedCreationMode),id:id});" +
      "}catch(error){return __toJson({ok:false,error:'create_sequence_exception',details:String(error),id:" + core.quoteEs(cmd.id || "") + "});}");
  }

  function buildCreateSequenceScript(cmd) {
    return esWrap("try{if(!app.project)return __toJson({ok:false,error:'no_project',id:" + core.quoteEs(cmd.id || "") + "});" +
      createSequencePrelude(cmd) +
      "presetPath=resolvePresetPath();var createdSequence=null;var creationErrors=[];" +
      "function recordCreationError(mode,error){creationErrors.push({mode:mode,details:String(error)});}" +
      "function confirmCreatedSequence(){var activeSequence=app.project.activeSequence;for(var attempt=0;attempt<30;attempt++){if(activeSequence&&activeSequence.name===name)break;createdSequence=createdSequence||findSequence(name,generatedSequenceId);if(createdSequence){if(app.project.openSequence&&createdSequence.sequenceID){try{app.project.openSequence(createdSequence.sequenceID);}catch(_openIgnored){}}activeSequence=app.project.activeSequence||createdSequence;if(activeSequence&&activeSequence.name===name)break;}if(typeof $!=='undefined'&&$.sleep)$.sleep(100);activeSequence=app.project.activeSequence;}if(!activeSequence||activeSequence.name!==name){createdSequence=createdSequence||findSequence(name,generatedSequenceId);return __toJson({ok:false,error:(createdSequence?'sequence_not_activated':'created_sequence_not_found'),sequenceName:name,requestedPresetPath:requestedPresetPath,presetPath:usedPresetPath,activeSequenceName:(activeSequence&&activeSequence.name)?String(activeSequence.name):'',sequenceCount:getSequenceCount(),sequenceNames:collectSequenceNames(10),mode:(creationMode||attemptedCreationMode),creationErrors:creationErrors,id:id});}return __toJson({ok:true,sequenceName:(activeSequence&&activeSequence.name)?String(activeSequence.name):name,requestedPresetPath:requestedPresetPath,presetPath:usedPresetPath,mode:(creationMode||attemptedCreationMode),id:id});}" +
      "function findFirstFootageItem(folder){if(!folder||!folder.children)return null;var clipType=(typeof ProjectItemType!=='undefined'&&ProjectItemType&&ProjectItemType.CLIP!==undefined)?ProjectItemType.CLIP:1;var binType=(typeof ProjectItemType!=='undefined'&&ProjectItemType&&ProjectItemType.BIN!==undefined)?ProjectItemType.BIN:2;for(var i=0;i<folder.children.numItems;i++){var item=folder.children[i];if(!item)continue;if(item.type===clipType)return item;if(item.type===binType){var nested=findFirstFootageItem(item);if(nested)return nested;}}return null;}" +
      "if(!requestedMediaPath&&app.project.createNewSequenceFromClips){var autoItem=findFirstFootageItem(app.project.rootItem);if(autoItem){try{attemptedCreationMode='createNewSequenceFromClips';creationMode='createNewSequenceFromClips';usedPresetPath='';createdSequence=app.project.createNewSequenceFromClips(name,[autoItem],app.project.rootItem);return confirmCreatedSequence();}catch(autoClipsError){recordCreationError('createNewSequenceFromClips',autoClipsError);creationMode='';}}}" +
      "if(requestedMediaPath){var sourceItem=findProjectItemByMediaPath(app.project.rootItem,requestedMediaPath);if(!sourceItem)return __toJson({ok:false,error:'media_not_found',mediaPath:requestedMediaPath,id:id});if(app.project.createNewSequenceFromClips){try{attemptedCreationMode='createNewSequenceFromClips';creationMode='createNewSequenceFromClips';usedPresetPath='';createdSequence=app.project.createNewSequenceFromClips(name,[sourceItem],app.project.rootItem);return confirmCreatedSequence();}catch(sequenceFromClipsError){recordCreationError('createNewSequenceFromClips',sequenceFromClipsError);creationMode='';}}else{recordCreationError('createNewSequenceFromClips','sequence_from_clips_api_unavailable');}}" +
      "if(presetPath&&app.enableQE&&typeof app.enableQE==='function'){try{app.enableQE();if(typeof qe!=='undefined'&&qe&&qe.project&&qe.project.newSequence){attemptedCreationMode='qe.project.newSequence';creationMode='qe.project.newSequence';usedPresetPath=presetPath;qe.project.newSequence(name,presetPath);return confirmCreatedSequence();}recordCreationError('qe.project.newSequence','qe_sequence_api_unavailable');}catch(qeSequenceError){recordCreationError('qe.project.newSequence',qeSequenceError);creationMode='';}}" +
      "if(app.project.createNewSequence){try{attemptedCreationMode='createNewSequence';creationMode='createNewSequence';usedPresetPath='';createdSequence=app.project.createNewSequence(name,generatedSequenceId);return confirmCreatedSequence();}catch(createSequenceError){recordCreationError('createNewSequence',createSequenceError);creationMode='';}}" +
      "if(app.project.newSequence){if(!presetPath){recordCreationError('newSequence','sequence_preset_not_found');}else{try{attemptedCreationMode='newSequence';creationMode='newSequence';usedPresetPath=presetPath;app.project.newSequence(name,presetPath);return confirmCreatedSequence();}catch(newSequenceError){recordCreationError('newSequence',newSequenceError);creationMode='';}}}" +
      "if(!presetPath)return __toJson({ok:false,error:'sequence_preset_not_found',creationErrors:creationErrors.length?creationErrors:[{mode:'qe.project.newSequence',details:'sequence_preset_not_found'}],id:id});" +
      "return __toJson({ok:false,error:'created_sequence_not_found',sequenceName:name,requestedPresetPath:requestedPresetPath,presetPath:usedPresetPath,activeSequenceName:'',sequenceCount:getSequenceCount(),sequenceNames:collectSequenceNames(10),mode:(creationMode||attemptedCreationMode),creationErrors:creationErrors,id:id});" +
      "}catch(error){return __toJson({ok:false,error:'create_sequence_exception',details:String(error),id:" + core.quoteEs(cmd.id || "") + "});}");
  }

  function buildActionScript(cmd) {
    var params = cmd.params || {};
    var id = core.quoteEs(cmd.id || "");

    switch (cmd.action) {
      case "ping":
        return esWrap("return __toJson({ok:true,action:'ping',id:" + id + "});");
      case "get_project_info":
        return esWrap("try{var project=app.project;if(!project)return __toJson({ok:false,error:'no_project',id:" + id + "});function countItems(folder){if(!folder||!folder.children)return 0;var total=0;var binType=(typeof ProjectItemType!=='undefined'&&ProjectItemType&&ProjectItemType.BIN!==undefined)?ProjectItemType.BIN:2;for(var i=0;i<folder.children.numItems;i++){var item=folder.children[i];if(!item)continue;total+=1;if(item.type===binType)total+=countItems(item);}return total;}var projectPath='';try{projectPath=String(project.path||'');}catch(_projectPathError){}var activeSequence=project.activeSequence;return __toJson({ok:true,projectName:String(project.name||''),projectPath:projectPath,activeSequence:activeSequence?{name:String(activeSequence.name||''),videoTracks:activeSequence.videoTracks?activeSequence.videoTracks.numTracks:0,duration:activeSequence.end?activeSequence.end/254016000000:0}:null,itemCount:countItems(project.rootItem),id:" + id + "});}catch(error){return __toJson({ok:false,error:'get_project_info_exception',details:String(error),id:" + id + "});}");
      case "open_project":
        var openPath = core.quoteEs(String(params.path || ""));
        return esWrap("try{var fileRef=new File(" + openPath + ");if(!fileRef.exists)return __toJson({ok:false,error:'file_not_found',id:" + id + "});var projectPath=fileRef.fsName?String(fileRef.fsName):" + openPath + ";var opened=app.openDocument(projectPath,true,true,true,true);if(!opened)return __toJson({ok:false,error:'open_failed',id:" + id + "});return __toJson({ok:true,projectName:String(app.project.name||''),projectPath:String(app.project.path||projectPath),id:" + id + "});}catch(error){return __toJson({ok:false,error:'open_project_exception',details:String(error),id:" + id + "});}");
      case "import_media":
        var paths = core.asciiJson((params.paths || []).map(function (value) { return core.normPath(value); }));
        var importMode = core.quoteEs(String(params.importMode || "reference-only"));
        return esWrap("try{if(!app.project)return __toJson({ok:false,error:'no_project',id:" + id + "});var importMode=" + importMode + ";if(importMode!=='reference-only')return __toJson({ok:false,error:'unsupported_import_mode',importMode:importMode,supportedModes:['reference-only'],id:" + id + "});var paths=" + paths + ";var results=[];function isGeneratedArtifact(pathValue){var normalized=String(pathValue||'').split('\\\\').join('/').toLowerCase();return normalized.indexOf('/premiere-fade-verify-')!==-1||normalized.indexOf('/fade_check/')!==-1||normalized.indexOf('/_premiere_out/fade_check/')!==-1;}for(var i=0;i<paths.length;i++){var originalPath=paths[i];if(isGeneratedArtifact(originalPath)){results.push({path:originalPath,importMode:'reference-only',copied:false,ok:false,error:'generated_verification_artifact_not_allowed'});continue;}var fileRef=(typeof File==='function')?new File(originalPath):null;var importPath=originalPath;if(fileRef){if(!fileRef.exists){results.push({path:originalPath,importMode:'reference-only',copied:false,ok:false,error:'file_not_found'});continue;}if(fileRef.fsName)importPath=String(fileRef.fsName);}var imported=app.project.importFiles([importPath],true,app.project.rootItem,false);results.push({path:originalPath,importedPath:importPath,importMode:'reference-only',copied:false,ok:!!imported});}return __toJson({ok:true,mediaPolicy:'reference-only',copyOperations:0,results:results,id:" + id + "});}catch(error){return __toJson({ok:false,error:'import_media_exception',details:String(error),id:" + id + "});}");
      case "add_clip_to_timeline":
        var mediaPath = core.quoteEs(core.normPath(params.mediaPath || ""));
        var trackIndex = Number(params.trackIndex || 0);
        var startTime = Number(params.startTime || 0);
        return esWrap("try{if(!app.project)return __toJson({ok:false,error:'no_project',id:" + id + "});var seq=app.project.activeSequence;if(!seq)return __toJson({ok:false,error:'no_active_sequence',id:" + id + "});function normalizePath(value){return String(value||'').split('\\\\').join('/');}function fileNameFromPath(value){var normalized=normalizePath(value);var parts=normalized.split('/');return parts.length?parts[parts.length-1]:normalized;}function sameMediaPath(a,b){var left=normalizePath(a);var right=normalizePath(b);return left===right||fileNameFromPath(left)===fileNameFromPath(right);}function findItem(folder,targetPath){if(!folder||!folder.children)return null;var binType=(typeof ProjectItemType!=='undefined'&&ProjectItemType&&ProjectItemType.BIN!==undefined)?ProjectItemType.BIN:2;for(var i=0;i<folder.children.numItems;i++){var item=folder.children[i];if(!item)continue;if(item.getMediaPath&&sameMediaPath(item.getMediaPath(),targetPath))return item;if(item.type===binType){var nested=findItem(item,targetPath);if(nested)return nested;}}return null;}function findInsertedClip(clips,targetPath,startSeconds){if(!clips)return null;var total=(typeof clips.numItems==='number')?clips.numItems:0;for(var i=0;i<total;i++){var clip=clips[i];if(!clip||!clip.projectItem||!clip.projectItem.getMediaPath)continue;if(!sameMediaPath(clip.projectItem.getMediaPath(),targetPath))continue;if(!clip.start||clip.start.seconds===undefined||Number(clip.start.seconds)===startSeconds)return clip;}return null;}var clipItem=findItem(app.project.rootItem," + mediaPath + ");if(!clipItem)return __toJson({ok:false,error:'media_not_found',mediaPath:" + mediaPath + ",id:" + id + "});var track=seq.videoTracks[" + trackIndex + "];if(!track)return __toJson({ok:false,error:'track_not_found',trackIndex:" + trackIndex + ",id:" + id + "});track.overwriteClip(clipItem," + startTime + ");if(!findInsertedClip(track.clips," + mediaPath + "," + startTime + "))return __toJson({ok:false,error:'clip_not_added',mediaPath:" + mediaPath + ",trackIndex:" + trackIndex + ",startTime:" + startTime + ",id:" + id + "});return __toJson({ok:true,message:'clip_added',trackIndex:" + trackIndex + ",startTime:" + startTime + ",id:" + id + "});}catch(error){return __toJson({ok:false,error:'add_clip_to_timeline_exception',details:String(error),id:" + id + "});}");
      case "create_sequence":
        return buildCreateSequenceScript(cmd);
      case "export_sequence":
        var outputPath = core.quoteEs(core.normPath(params.outputPath || "C:/pr-mcp-cmd/output.mp4"));
        return esWrap("if(!app.project)return __toJson({ok:false,error:'no_project',id:" + id + "});var seq=app.project.activeSequence;if(!seq)return __toJson({ok:false,error:'no_active_sequence',id:" + id + "});app.encoder.launchEncoder();var jobID=app.encoder.encodeSequence(seq," + outputPath + ",'',app.encoder.ENCODE_IN_TO_OUT,true);return __toJson({ok:true,jobID:jobID,outputPath:" + outputPath + ",id:" + id + "});");
      case "call_plugin":
        var entry = core.quoteEs(String(params.entry || ""));
        var method = core.quoteEs(String(params.method || ""));
        var pluginParams = core.asciiJson(params.params || {});
        return esWrap("try{var pluginFile=new File(" + entry + ");if(!pluginFile.exists)return __toJson({ok:false,error:'plugin_not_found',id:" + id + "});$.evalFile(pluginFile);if(typeof __pluginDispatch!=='function')return __toJson({ok:false,error:'no_dispatch',id:" + id + "});return __toJson({ok:true,result:__pluginDispatch(" + method + "," + pluginParams + "),id:" + id + "});}catch(error){return __toJson({ok:false,error:'call_plugin_exception',details:String(error),id:" + id + "});}");
      default:
        throw new Error("unknown_action:" + cmd.action);
    }
  }

  function buildScript(cmd) {
    return buildActionScript(cmd);
  }

  global.__PR_MCP_PANEL_SCRIPTS__ = {
    esJsonHelpers: esJsonHelpers,
    esWrap: esWrap,
    buildReadCommandScript: buildReadCommandScript,
    buildChooseProjectScript: buildChooseProjectScript,
    buildBringHostToFrontScript: buildBringHostToFrontScript,
    buildCreateSequenceSupportScript: buildCreateSequenceSupportScript,
    buildCreateSequenceAttemptScript: buildCreateSequenceAttemptScript,
    buildCreateSequenceConfirmScript: buildCreateSequenceConfirmScript,
    buildCreateSequenceScript: buildCreateSequenceScript,
    buildActionScript: buildActionScript,
    buildScript: buildScript,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
