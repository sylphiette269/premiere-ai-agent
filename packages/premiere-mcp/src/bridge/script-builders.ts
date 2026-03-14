import type { PremiereSequenceSettings } from "./types.js";

type QuoteFn = (value: string) => string;

function toNumericLiteral(
  value: number | undefined,
  label: string,
  min: number,
): string {
  if (value === undefined) {
    return "";
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < min) {
    throw new Error(`Invalid ${label}`);
  }

  return String(numericValue);
}

export function buildCreateProjectScript(name: string, location: string, quote: QuoteFn): string {
  return `
      app.newProject(${quote(name)}, ${quote(location)});
      var project = app.project;
      return JSON.stringify({ id: project.documentID, name: project.name, path: project.path, isOpen: true, sequences: [], projectItems: [] });
    `;
}

export function buildOpenProjectScript(filePath: string, quote: QuoteFn): string {
  return `
      app.openDocument(${quote(filePath)});
      var project = app.project;
      return JSON.stringify({ id: project.documentID, name: project.name, path: project.path, isOpen: true, sequences: [], projectItems: [] });
    `;
}

export function buildSaveProjectScript(): string {
  return "app.project.save(); return JSON.stringify({ success: true });";
}

export function buildImportMediaScript(filePath: string, quote: QuoteFn): string {
  return `
      try {
        function collectItems(parent, out) {
          for (var i = 0; i < parent.children.numItems; i++) {
            var child = parent.children[i];
            out.push(child);
            if (child.type === ProjectItemType.BIN) {
              collectItems(child, out);
            }
          }
        }
        var beforeImport = [];
        collectItems(app.project.rootItem, beforeImport);
        var fileRef = new File(${quote(filePath)});
        if (!fileRef.exists) return JSON.stringify({ success: false, error: 'file_not_found' });
        var importedOk = app.project.importFiles([fileRef.fsName], true, app.project.rootItem, false);
        if (!importedOk) return JSON.stringify({ success: false, error: 'import_failed' });
        var afterImport = [];
        collectItems(app.project.rootItem, afterImport);
        var importedItem = null;
        for (var afterIndex = 0; afterIndex < afterImport.length; afterIndex++) {
          var alreadySeen = false;
          for (var beforeIndex = 0; beforeIndex < beforeImport.length; beforeIndex++) {
            if (beforeImport[beforeIndex].nodeId === afterImport[afterIndex].nodeId) {
              alreadySeen = true;
              break;
            }
          }
          if (!alreadySeen) {
            importedItem = afterImport[afterIndex];
            break;
          }
        }
        if (!importedItem) return JSON.stringify({ success: false, error: 'item_not_located' });
        return JSON.stringify({
          success: true,
          id: importedItem.nodeId,
          name: importedItem.name,
          type: importedItem.type.toString(),
          mediaPath: importedItem.getMediaPath ? importedItem.getMediaPath() : fileRef.fsName,
          mediaPolicy: 'reference-only',
          copied: false
        });
      } catch (error) {
        return JSON.stringify({ success: false, error: error.toString() });
      }
    `;
}

export function buildCreateSequenceScript(
  name: string,
  presetPathOrSettings: string | PremiereSequenceSettings | undefined,
  settingsOrQuote: PremiereSequenceSettings | QuoteFn | undefined,
  maybeQuote?: QuoteFn,
): string {
  const settings = typeof settingsOrQuote === "function"
    ? (typeof presetPathOrSettings === "object" && presetPathOrSettings !== null ? presetPathOrSettings : undefined)
    : settingsOrQuote;
  const quote = typeof settingsOrQuote === "function"
    ? settingsOrQuote
    : maybeQuote;

  if (typeof quote !== "function") {
    throw new Error("buildCreateSequenceScript requires a quoting function");
  }

  const hasSettings = Boolean(
    settings &&
      (
        settings.width !== undefined ||
        settings.height !== undefined ||
        settings.frameRate !== undefined ||
        settings.sampleRate !== undefined
      ),
  );

  const widthLiteral = toNumericLiteral(settings?.width, "sequence width", 1);
  const heightLiteral = toNumericLiteral(settings?.height, "sequence height", 1);
  const frameRateLiteral = toNumericLiteral(settings?.frameRate, "frame rate", 0.000001);
  const sampleRateLiteral = toNumericLiteral(settings?.sampleRate, "sample rate", 1);

  const widthScript = widthLiteral
    ? `settings.videoFrameWidth = ${widthLiteral};`
    : "";
  const heightScript = heightLiteral
    ? `settings.videoFrameHeight = ${heightLiteral};`
    : "";
  const frameRateScript = frameRateLiteral
    ? `settings.videoFrameRate = new Time(); settings.videoFrameRate.setSecondsAsFraction(1, ${frameRateLiteral});`
    : "";
  const sampleRateScript = sampleRateLiteral
    ? `settings.audioSampleRate = new Time(); settings.audioSampleRate.setSecondsAsFraction(1, ${sampleRateLiteral});`
    : "";
  const applySettings = hasSettings
    ? `var settings = sequence.getSettings(); ${widthScript} ${heightScript} ${frameRateScript} ${sampleRateScript} sequence.setSettings(settings);`
    : "";

  return `
      var requestedSequenceName = ${quote(name)};
      function normalizeSequenceName(value) {
        return String(value || '').toLowerCase();
      }
      var normalizedRequestedSequenceName = normalizeSequenceName(requestedSequenceName);
      var sequence = null;
      if (app.project.activeSequence) {
        var activeSequenceName = String(app.project.activeSequence.name || '');
        if (activeSequenceName === requestedSequenceName || normalizeSequenceName(activeSequenceName) === normalizedRequestedSequenceName) {
          sequence = app.project.activeSequence;
        }
      }
      for (var sequenceIndex = app.project.sequences.numSequences - 1; sequenceIndex >= 0; sequenceIndex--) {
        if (sequence) {
          break;
        }
        var candidateSequence = app.project.sequences[sequenceIndex];
        var candidateSequenceName = candidateSequence ? String(candidateSequence.name || '') : '';
        if (
          candidateSequence
          && (
            candidateSequenceName === requestedSequenceName
            || normalizeSequenceName(candidateSequenceName) === normalizedRequestedSequenceName
          )
        ) {
          sequence = candidateSequence;
          break;
        }
      }
      if (!sequence) {
        return JSON.stringify({
          success: false,
          error: "created_sequence_not_found",
          sequenceName: requestedSequenceName
        });
      }
      if (app.project.openSequence && sequence.sequenceID) {
        try {
          app.project.openSequence(sequence.sequenceID);
        } catch (_openSequenceError) {}
      }
      ${applySettings}
      return JSON.stringify({
        id: sequence.sequenceID,
        name: sequence.name,
        duration: bridgeTicksToSeconds(sequence.end) - bridgeTicksToSeconds(sequence.zeroPoint),
        frameRate: sequence.timebase ? (254016000000 / parseInt(sequence.timebase, 10)) : undefined,
        videoTracks: [],
        audioTracks: []
      });
    `;
}

export function buildAddToTimelineScript(
  sequenceId: string,
  projectItemId: string,
  trackIndex: number,
  time: number,
  quote: QuoteFn,
): string {
  return `
      try {
        var sequence = bridgeLookupSequence(${quote(sequenceId)});
        if (!sequence) return JSON.stringify({ success: false, error: 'sequence_not_found' });
        var projectItem = bridgeLookupProjectItem(${quote(projectItemId)});
        if (!projectItem) return JSON.stringify({ success: false, error: 'project_item_not_found' });
        var track = sequence.videoTracks[${trackIndex}];
        if (!track) return JSON.stringify({ success: false, error: 'video_track_not_found' });
        var expectedStartSeconds = ${time};
        var frameTolerance = 0.001;
        if (sequence.timebase) {
          var timebaseTicks = parseInt(sequence.timebase, 10);
          if (!isNaN(timebaseTicks) && timebaseTicks > 0) {
            frameTolerance = Math.max((timebaseTicks / 254016000000) / 2, 0.000001);
          }
        }
        var existingVideoClipIds = {};
        for (var existingVideoClipIndex = 0; existingVideoClipIndex < track.clips.numItems; existingVideoClipIndex++) {
          var existingVideoClip = track.clips[existingVideoClipIndex];
          if (existingVideoClip && existingVideoClip.nodeId !== undefined) {
            existingVideoClipIds[String(existingVideoClip.nodeId)] = true;
          }
        }
        var existingAudioClipIds = {};
        for (var existingAudioTrackIndex = 0; existingAudioTrackIndex < sequence.audioTracks.numTracks; existingAudioTrackIndex++) {
          var existingAudioTrack = sequence.audioTracks[existingAudioTrackIndex];
          if (!existingAudioTrack || !existingAudioTrack.clips) {
            continue;
          }
          for (var existingAudioClipIndex = 0; existingAudioClipIndex < existingAudioTrack.clips.numItems; existingAudioClipIndex++) {
            var existingAudioClip = existingAudioTrack.clips[existingAudioClipIndex];
            if (existingAudioClip && existingAudioClip.nodeId !== undefined) {
              existingAudioClipIds[String(existingAudioClip.nodeId)] = true;
            }
          }
        }
        track.overwriteClip(projectItem, ${time});
        var placedClips = [];
        function collectPlacedClip(clip, resolvedTrackType, resolvedTrackIndex, resolvedClipIndex) {
          if (!clip || !clip.projectItem || clip.projectItem.nodeId !== projectItem.nodeId) {
            return;
          }
          var clipStartSeconds = clip && clip.start && clip.start.seconds !== undefined ? Number(clip.start.seconds) : NaN;
          var startDelta = isNaN(clipStartSeconds) ? Number.POSITIVE_INFINITY : Math.abs(clipStartSeconds - expectedStartSeconds);
          if (startDelta <= frameTolerance) {
            var clipNodeId = clip.nodeId !== undefined ? String(clip.nodeId) : "";
            var existingClipIds = resolvedTrackType === 'audio' ? existingAudioClipIds : existingVideoClipIds;
            placedClips.push({
              clip: clip,
              trackType: resolvedTrackType,
              trackIndex: resolvedTrackIndex,
              clipIndex: resolvedClipIndex,
              startDelta: startDelta,
              wasPresentBefore: clipNodeId ? existingClipIds[clipNodeId] === true : false
            });
          }
        }
        for (var clipIndex = 0; clipIndex < track.clips.numItems; clipIndex++) {
          collectPlacedClip(track.clips[clipIndex], 'video', ${trackIndex}, clipIndex);
        }
        for (var audioTrackIndex = 0; audioTrackIndex < sequence.audioTracks.numTracks; audioTrackIndex++) {
          var audioTrack = sequence.audioTracks[audioTrackIndex];
          for (var audioClipIndex = 0; audioClipIndex < audioTrack.clips.numItems; audioClipIndex++) {
            collectPlacedClip(audioTrack.clips[audioClipIndex], 'audio', audioTrackIndex, audioClipIndex);
          }
        }
        if (!placedClips.length) return JSON.stringify({ success: false, error: 'clip_placement_failed' });
        placedClips.sort(function(a, b) {
          if (a.wasPresentBefore !== b.wasPresentBefore) {
            return a.wasPresentBefore ? 1 : -1;
          }
          if (a.trackType !== b.trackType) {
            if (a.trackType === 'video') return -1;
            if (b.trackType === 'video') return 1;
          }
          if (a.startDelta !== b.startDelta) {
            return a.startDelta - b.startDelta;
          }
          if (a.trackIndex !== b.trackIndex) {
            return a.trackIndex - b.trackIndex;
          }
          return a.clipIndex - b.clipIndex;
        });
        var primaryMatch = placedClips[0];
        var placedClip = primaryMatch.clip;
        var serializedPlacedClips = [];
        for (var placedClipIndex = 0; placedClipIndex < placedClips.length; placedClipIndex++) {
          var match = placedClips[placedClipIndex];
          serializedPlacedClips.push({
            id: match.clip.nodeId,
            name: match.clip.name,
            inPoint: match.clip.start.seconds,
            outPoint: match.clip.end.seconds,
            duration: match.clip.duration.seconds,
            mediaPath: match.clip.projectItem && match.clip.projectItem.getMediaPath ? match.clip.projectItem.getMediaPath() : '',
            trackType: match.trackType,
            trackIndex: match.trackIndex,
            clipIndex: match.clipIndex
          });
        }
        return JSON.stringify({
          success: true,
          id: placedClip.nodeId,
          name: placedClip.name,
          inPoint: placedClip.start.seconds,
          outPoint: placedClip.end.seconds,
          duration: placedClip.duration.seconds,
          mediaPath: placedClip.projectItem && placedClip.projectItem.getMediaPath ? placedClip.projectItem.getMediaPath() : '',
          trackType: primaryMatch.trackType,
          trackIndex: primaryMatch.trackIndex,
          clipIndex: primaryMatch.clipIndex,
          placedClips: serializedPlacedClips
        });
      } catch (error) {
        return JSON.stringify({ success: false, error: error.toString() });
      }
    `;
}

export function buildRenderSequenceScript(
  sequenceId: string,
  outputPath: string,
  presetPath: string,
  quote: QuoteFn,
): string {
  return `
      var sequence = app.project.getSequenceByID(${quote(sequenceId)});
      if (!sequence) return JSON.stringify({ success: false, error: 'sequence_not_found' });
      app.encoder.encodeSequence(sequence, ${quote(outputPath)}, ${quote(presetPath)}, app.encoder.ENCODE_ENTIRE, false);
      return JSON.stringify({ success: true });
    `;
}

export function buildListProjectItemsScript(): string {
  return `
      try {
        if (!app.project || !app.project.rootItem) throw new Error('no_project');
        function walk(item) {
          var out = [];
          if (item.type === ProjectItemType.BIN) {
            for (var i = 0; i < item.children.numItems; i++) out = out.concat(walk(item.children[i]));
          } else {
            out.push({
              id: item.nodeId || item.treePath || item.name,
              name: item.name,
              type: item.type === ProjectItemType.BIN ? 'bin' : (item.type === ProjectItemType.SEQUENCE ? 'sequence' : 'footage'),
              mediaPath: item.getMediaPath ? item.getMediaPath() : undefined,
              duration: item.getOutPoint ? (item.getOutPoint() - item.getInPoint()) : undefined,
              frameRate: item.getVideoFrameRate ? item.getVideoFrameRate() : undefined
            });
          }
          return out;
        }
        var items = walk(app.project.rootItem);
        return JSON.stringify({ ok: true, items: items });
      } catch (error) {
        return JSON.stringify({ ok: false, error: String(error) });
      }
    `;
}
