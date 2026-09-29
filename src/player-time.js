export function getAbsolutePlaybackTime(player, currentTime) {
  return Math.max(
    0,
    Number(player?.segmentOffsetSeconds ?? 0)
      + Number(player?.startSeconds ?? 0)
      + Number(currentTime ?? 0),
  );
}

export function buildPlaybackRecoveryState(player, currentTime) {
  return {
    ...player,
    transport: "local-transcode",
    startSeconds: getAbsolutePlaybackTime(player, currentTime),
  };
}
