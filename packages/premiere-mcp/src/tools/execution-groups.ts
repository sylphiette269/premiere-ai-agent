import { withVerification } from '../bridge/verification.js';

export type ToolExecutionArgs = Record<string, any>;

export type ToolExecutionHandler = (
  args: ToolExecutionArgs,
) => Promise<any>;

export type ToolExecutionFactoryContext = Record<
  string,
  (...args: any[]) => Promise<any>
>;

function normalizeKeyframeParamArgs<T extends ToolExecutionArgs>(
  args: T,
): T & { paramName: string } {
  const paramName = args.paramName ?? args.propertyName;
  if (typeof paramName !== 'string' || paramName.length === 0) {
    throw new Error('paramName or propertyName is required');
  }

  return {
    ...args,
    paramName,
  };
}

export function createPlanningExecutionGroup(
  ctx: ToolExecutionFactoryContext,
): Record<string, ToolExecutionHandler> {
  return {
    list_project_items: (args) =>
      ctx.listProjectItems(args.includeBins, args.includeMetadata),
    list_sequences: () => ctx.listSequences(),
    list_sequence_tracks: (args) => ctx.listSequenceTracks(args.sequenceId),
    get_project_info: () => ctx.getProjectInfo(),
    build_motion_graphics_demo: (args) =>
      ctx.buildMotionGraphicsDemo(
        args.sequenceName,
        args.transitionName,
        args.transitionDuration,
        args.naturalLanguagePrompt,
        args.referenceBlueprintPath,
      ),
    plan_edit_assembly: (args) => ctx.planEditAssemblyTool(args),
    review_edit_reasonability: (args) =>
      ctx.reviewEditReasonabilityTool(args),
    analyze_reference_video: (args) => ctx.analyzeReferenceVideoTool(args),
    plan_replication_from_video: (args) =>
      ctx.planReplicationFromVideoTool(args),
    compare_to_reference_video: (args) =>
      ctx.compareToReferenceVideoTool(args),
    parse_edit_request: (args) => ctx.parseEditRequestTool(args),
    plan_edit_from_request: (args) => ctx.planEditFromRequestTool(args),
    parse_keyframe_request: (args) =>
      ctx.parseKeyframeRequestTool(args),
    plan_keyframe_animation: (args) =>
      ctx.planKeyframeAnimationTool(args),
    apply_animation_preset: (args) => ctx.applyAnimationPreset(args),
    apply_keyframe_animation: (args) =>
      ctx.applyKeyframeAnimationTool(args),
    assemble_product_spot: (args) => ctx.assembleProductSpot(args),
    assemble_product_spot_closed_loop: (args) =>
      ctx.assembleProductSpotClosedLoop(args),
    build_brand_spot_from_mogrt_and_assets: (args) =>
      ctx.buildBrandSpotFromMogrtAndAssets(args),
  };
}

export function createEditingExecutionGroup(
  ctx: ToolExecutionFactoryContext,
): Record<string, ToolExecutionHandler> {
  const executeReadBack = async (
    readBackToolName: string,
    args: Record<string, unknown>,
  ): Promise<unknown> => {
    switch (readBackToolName) {
      case 'list_sequence_tracks':
        return ctx.listSequenceTracks(args.sequenceId);
      case 'get_clip_effects':
        return ctx.getClipEffects(args.clipId);
      case 'get_keyframes': {
        const normalizedArgs = normalizeKeyframeParamArgs(args);
        return ctx.getKeyframes(
          normalizedArgs.clipId,
          normalizedArgs.componentName,
          normalizedArgs.paramName,
        );
      }
      case 'get_clip_properties':
        return ctx.getClipProperties(args.clipId);
      default:
        throw new Error(`Unsupported verification read-back tool: ${readBackToolName}`);
    }
  };

  return {
    create_project: (args) => ctx.createProject(args.name, args.location),
    open_project: (args) => ctx.openProject(args.path),
    save_project: () => ctx.saveProject(),
    save_project_as: (args) => ctx.saveProjectAs(args.name, args.location),
    import_media: (args) =>
      ctx.importMedia(args.filePath, args.binName, args.importMode),
    import_folder: (args) =>
      ctx.importFolder(args.folderPath, args.binName, args.recursive),
    create_bin: (args) => ctx.createBin(args.name, args.parentBinName),
    create_sequence: (args) =>
      ctx.createSequence(
        args.name,
        args.presetPath,
        args.width,
        args.height,
        args.frameRate,
        args.sampleRate,
        args.mediaPath,
        args.avoidCreateNewSequence,
      ),
    duplicate_sequence: (args) =>
      ctx.duplicateSequence(args.sequenceId, args.newName),
    delete_sequence: (args) => ctx.deleteSequence(args.sequenceId),
    add_to_timeline: async (args) => withVerification(
      'add_to_timeline',
      args,
      await ctx.addToTimeline(
        args.sequenceId,
        args.projectItemId,
        args.trackIndex,
        args.time,
        args.insertMode,
      ),
      executeReadBack,
    ),
    remove_from_timeline: (args) =>
      ctx.removeFromTimeline(args.clipId, args.deleteMode),
    move_clip: (args) =>
      ctx.moveClip(args.clipId, args.newTime, args.newTrackIndex),
    trim_clip: (args) =>
      ctx.trimClip(args.clipId, args.inPoint, args.outPoint, args.duration),
    split_clip: (args) => ctx.splitClip(args.clipId, args.splitTime),
    apply_effect: async (args) => withVerification(
      'apply_effect',
      args,
      await ctx.applyEffect(args.clipId, args.effectName, args.parameters),
      executeReadBack,
    ),
    add_transition: (args) =>
      ctx.addTransition(
        args.clipId1,
        args.clipId2,
        args.transitionName,
        args.duration,
      ),
    add_transition_to_clip: (args) =>
      ctx.addTransitionToClip(
        args.clipId,
        args.transitionName,
        args.position,
        args.duration,
      ),
    inspect_transition_boundary: (args) =>
      ctx.inspectTransitionBoundary(
        args.clipId1,
        args.clipId2,
        args.duration,
      ),
    inspect_track_transition_boundaries: (args) =>
      ctx.inspectTrackTransitionBoundaries(
        args.sequenceId,
        args.trackIndex,
        args.trackType,
        args.duration,
      ),
    safe_batch_add_transitions: (args) =>
      ctx.safeBatchAddTransitions(
        args.sequenceId,
        args.trackIndex,
        args.transitionName,
        args.duration,
        args.trackType,
      ),
    adjust_audio_levels: (args) =>
      ctx.adjustAudioLevels(args.clipId, args.level),
    add_audio_keyframes: (args) =>
      ctx.addAudioKeyframes(args.clipId, args.keyframes),
    mute_track: (args) =>
      ctx.muteTrack(args.sequenceId, args.trackIndex, args.muted),
    add_text_overlay: (args) => ctx.addTextOverlay(args),
    color_correct: (args) => ctx.colorCorrect(args.clipId, args),
    apply_lut: (args) =>
      ctx.applyLut(args.clipId, args.lutPath, args.intensity),
    export_sequence: (args) =>
      ctx.exportSequence(
        args.sequenceId,
        args.outputPath,
        args.presetPath,
        args.format,
        args.quality,
        args.resolution,
      ),
    export_frame: (args) =>
      ctx.exportFrame(
        args.sequenceId,
        args.time,
        args.outputPath,
        args.format,
      ),
    add_marker: (args) =>
      ctx.addMarker(
        args.sequenceId,
        args.time,
        args.name,
        args.comment,
        args.color,
        args.duration,
      ),
    delete_marker: (args) => ctx.deleteMarker(args.sequenceId, args.markerId),
    update_marker: (args) =>
      ctx.updateMarker(args.sequenceId, args.markerId, args),
    list_markers: (args) => ctx.listMarkers(args.sequenceId),
    add_track: (args) =>
      ctx.addTrack(args.sequenceId, args.trackType, args.position),
    delete_track: (args) =>
      ctx.deleteTrack(args.sequenceId, args.trackType, args.trackIndex),
    lock_track: (args) =>
      ctx.lockTrack(
        args.sequenceId,
        args.trackType,
        args.trackIndex,
        args.locked,
      ),
    toggle_track_visibility: (args) =>
      ctx.toggleTrackVisibility(
        args.sequenceId,
        args.trackIndex,
        args.visible,
      ),
    link_audio_video: (args) =>
      ctx.linkAudioVideo(args.clipId, args.linked),
    apply_audio_effect: (args) =>
      ctx.applyAudioEffect(args.clipId, args.effectName, args.parameters),
    duplicate_clip: (args) => ctx.duplicateClip(args.clipId, args.offset),
    reverse_clip: (args) =>
      ctx.reverseClip(args.clipId, args.maintainAudioPitch),
    enable_disable_clip: (args) =>
      ctx.enableDisableClip(args.clipId, args.enabled),
    replace_clip: (args) =>
      ctx.replaceClip(
        args.clipId,
        args.newProjectItemId,
        args.preserveEffects,
      ),
    get_sequence_settings: (args) =>
      ctx.getSequenceSettings(args.sequenceId),
    set_sequence_settings: (args) =>
      ctx.setSequenceSettings(args.sequenceId, args.settings),
    get_clip_properties: (args) => ctx.getClipProperties(args.clipId),
    get_clip_effects: (args) => ctx.getClipEffects(args.clipId),
    inspect_clip_components: (args) =>
      ctx.inspectClipComponents(
        args.trackIndex,
        args.clipIndex,
        args.trackType,
      ),
    set_clip_properties: async (args) => withVerification(
      'set_clip_properties',
      args,
      await ctx.setClipProperties(args.clipId, args.properties),
      executeReadBack,
    ),
    add_to_render_queue: (args) =>
      ctx.addToRenderQueue(
        args.sequenceId,
        args.outputPath,
        args.presetPath,
        args.startImmediately,
      ),
    get_render_queue_status: () => ctx.getRenderQueueStatus(),
    stabilize_clip: (args) =>
      ctx.stabilizeClip(args.clipId, args.smoothness),
    speed_change: (args) =>
      ctx.speedChange(args.clipId, args.speed, args.maintainAudio),
    get_playhead_position: (args) =>
      ctx.getPlayheadPosition(args.sequenceId),
    set_playhead_position: (args) =>
      ctx.setPlayheadPosition(args.sequenceId, args.time),
    get_selected_clips: (args) => ctx.getSelectedClips(args.sequenceId),
    list_available_effects: () => ctx.listAvailableEffects(),
    list_available_transitions: () => ctx.listAvailableTransitions(),
    list_available_audio_effects: () => ctx.listAvailableAudioEffects(),
    list_available_audio_transitions: () =>
      ctx.listAvailableAudioTransitions(),
    add_keyframe: async (args) => {
      const normalizedArgs = normalizeKeyframeParamArgs(args);
      return withVerification(
        'add_keyframe',
        normalizedArgs,
        await ctx.addKeyframe(
          normalizedArgs.clipId,
          normalizedArgs.componentName,
          normalizedArgs.paramName,
          normalizedArgs.time,
          normalizedArgs.value,
          normalizedArgs.interpolation,
        ),
        executeReadBack,
      );
    },
    set_keyframe_interpolation: (args) => {
      const normalizedArgs = normalizeKeyframeParamArgs(args);
      return ctx.setKeyframeInterpolation(
        normalizedArgs.clipId,
        normalizedArgs.componentName,
        normalizedArgs.paramName,
        normalizedArgs.time,
        normalizedArgs.interpolation,
      );
    },
    remove_keyframe: (args) => {
      const normalizedArgs = normalizeKeyframeParamArgs(args);
      return ctx.removeKeyframe(
        normalizedArgs.clipId,
        normalizedArgs.componentName,
        normalizedArgs.paramName,
        normalizedArgs.time,
      );
    },
    get_keyframes: (args) => {
      const normalizedArgs = normalizeKeyframeParamArgs(args);
      return ctx.getKeyframes(
        normalizedArgs.clipId,
        normalizedArgs.componentName,
        normalizedArgs.paramName,
      );
    },
    set_work_area: (args) =>
      ctx.setWorkArea(args.sequenceId, args.inPoint, args.outPoint),
    get_work_area: (args) => ctx.getWorkArea(args.sequenceId),
    batch_add_transitions: (args) =>
      ctx.batchAddTransitions(
        args.sequenceId,
        args.trackIndex,
        args.transitionName,
        args.duration,
        args.trackType,
      ),
    batch_apply_effect: (args) =>
      ctx.batchApplyEffect(args.sequenceIds, args.trackIndex, args.effectName, args.parameters),
    batch_export: (args) => ctx.batchExport(args.exports),
    batch_color_correct: (args) =>
      ctx.batchColorCorrect(
        args.sequenceIds,
        args.trackIndex,
        args.adjustments,
      ),
    find_project_item_by_name: (args) =>
      ctx.findProjectItemByName(args.name, args.type),
    move_item_to_bin: (args) =>
      ctx.moveItemToBin(args.projectItemId, args.targetBinId),
    set_active_sequence: (args) => ctx.setActiveSequence(args.sequenceId),
    get_active_sequence: () => ctx.getActiveSequence(),
    get_clip_at_position: (args) =>
      ctx.getClipAtPosition(
        args.sequenceId,
        args.trackType,
        args.trackIndex,
        args.time,
      ),
    auto_reframe_sequence: (args) =>
      ctx.autoReframeSequence(
        args.sequenceId,
        args.numerator,
        args.denominator,
        args.motionPreset,
        args.newName,
      ),
    detect_scene_edits: (args) =>
      ctx.detectSceneEdits(
        args.sequenceId,
        args.action,
        args.applyCutsToLinkedAudio,
        args.sensitivity,
      ),
    create_caption_track: (args) =>
      ctx.createCaptionTrack(
        args.sequenceId,
        args.projectItemId,
        args.startTime,
        args.captionFormat,
      ),
    generate_subtitles: (args) => ctx.generateSubtitlesTool(args),
    create_subclip: (args) =>
      ctx.createSubclip(
        args.projectItemId,
        args.name,
        args.startTime,
        args.endTime,
        args.hasHardBoundaries,
        args.takeAudio,
        args.takeVideo,
      ),
    build_timeline_from_xml: (args) =>
      ctx.buildTimelineFromXml(
        args.sequenceName,
        args.clips,
        args.transitionDurationSec,
        args.audioProjectItemId,
        args.frameRate,
        args.frameWidth,
        args.frameHeight,
        args.allowExperimentalMotion,
      ),
    };
  }

export function createMediaAdminExecutionGroup(
  ctx: ToolExecutionFactoryContext,
): Record<string, ToolExecutionHandler> {
  return {
    relink_media: (args) =>
      ctx.relinkMedia(args.projectItemId, args.newFilePath),
    delete_project_item: (args) =>
      ctx.deleteProjectItem(args.projectItemId, args.allowReferenced),
    set_color_label: (args) =>
      ctx.setColorLabel(args.projectItemId, args.colorIndex),
    get_color_label: (args) => ctx.getColorLabel(args.projectItemId),
    get_metadata: (args) => ctx.getMetadata(args.projectItemId),
    set_metadata: (args) =>
      ctx.setMetadata(args.projectItemId, args.key, args.value),
    get_footage_interpretation: (args) =>
      ctx.getFootageInterpretation(args.projectItemId),
    set_footage_interpretation: (args) =>
      ctx.setFootageInterpretation(
        args.projectItemId,
        args.frameRate,
        args.pixelAspectRatio,
      ),
    check_offline_media: () => ctx.checkOfflineMedia(),
    export_as_fcp_xml: (args) =>
      ctx.exportAsFcpXml(args.sequenceId, args.outputPath),
    undo: () => ctx.undo(),
    set_sequence_in_out_points: (args) =>
      ctx.setSequenceInOutPoints(
        args.sequenceId,
        args.inPoint,
        args.outPoint,
      ),
    get_sequence_in_out_points: (args) =>
      ctx.getSequenceInOutPoints(args.sequenceId),
    export_aaf: (args) =>
      ctx.exportAaf(
        args.sequenceId,
        args.outputPath,
        args.mixDownVideo,
        args.explodeToMono,
        args.sampleRate,
        args.bitsPerSample,
      ),
    consolidate_duplicates: () => ctx.consolidateDuplicates(),
    refresh_media: (args) => ctx.refreshMedia(args.projectItemId),
    import_sequences_from_project: (args) =>
      ctx.importSequencesFromProject(args.projectPath, args.sequenceIds),
    create_subsequence: (args) =>
      ctx.createSubsequence(args.sequenceId, args.ignoreTrackTargeting),
    import_mogrt: (args) =>
      ctx.importMogrt(
        args.sequenceId,
        args.mogrtPath,
        args.time,
        args.videoTrackIndex,
        args.audioTrackIndex,
      ),
    import_mogrt_from_library: (args) =>
      ctx.importMogrtFromLibrary(
        args.sequenceId,
        args.libraryName,
        args.mogrtName,
        args.time,
        args.videoTrackIndex,
        args.audioTrackIndex,
      ),
    plugin_list: () => ctx.listPlugins(),
    plugin_register: (args) => ctx.registerPlugin(args),
    plugin_set_enabled: (args) =>
      ctx.setPluginEnabled(args.id, args.enabled),
    plugin_call: (args) =>
      ctx.callPlugin(args.pluginId, args.method, args.params || {}),
    manage_proxies: (args) =>
      ctx.manageProxies(args.projectItemId, args.action, args.proxyPath),
  };
}
