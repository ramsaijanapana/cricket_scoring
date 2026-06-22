import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type {
  Commentary,
  PredictionEvent,
  StatusEvent,
  DLSUpdateEvent,
  DeliveryEvent,
  WicketEvent,
} from '@cricket/shared';
import { joinMatch, leaveMatch, getSocket, WS_EVENTS } from '../lib/socket';
import {
  patchCommentaryCache,
  patchMatchCache,
  patchMatchStatus,
  refetchMatchCache,
  type WsDeliveryPayload,
} from '../lib/match-cache';
import { useScoringStore } from '../stores/scoring-store';

export interface MilestoneToast {
  text: string;
  type: string;
}

export function useMatchSocket(matchId: string | undefined) {
  const queryClient = useQueryClient();
  const updateFromDelivery = useScoringStore((s) => s.updateFromDelivery);

  const [milestoneToast, setMilestoneToast] = useState<MilestoneToast | null>(null);
  const [prediction, setPrediction] = useState<PredictionEvent | null>(null);
  const [breakStatus, setBreakStatus] = useState<'innings_break' | 'rain_delay' | null>(null);
  const [dlsTarget, setDlsTarget] = useState<number | undefined>();
  const [latestCommentary, setLatestCommentary] = useState<Commentary | null>(null);
  const [deliveryVersion, setDeliveryVersion] = useState(0);

  useEffect(() => {
    if (!matchId) return;

    joinMatch(matchId);

    const socket = getSocket();
    const deliveryEvent = WS_EVENTS.delivery(matchId);
    const wicketEvent = WS_EVENTS.wicket(matchId);
    const overEvent = WS_EVENTS.over(matchId);
    const milestoneEvent = WS_EVENTS.milestone(matchId);
    const predictionEvent = WS_EVENTS.prediction(matchId);
    const statusEvent = WS_EVENTS.status(matchId);
    const dlsEvent = WS_EVENTS.dlsUpdate(matchId);

    const applyDeliveryUpdate = (data: WsDeliveryPayload & { commentary?: Commentary }) => {
      updateFromDelivery(data as Parameters<typeof updateFromDelivery>[0]);
      const patchResult = patchMatchCache(queryClient, matchId, data);
      if (patchResult === 'conflict') {
        refetchMatchCache(queryClient, matchId);
      }
      if (data.commentary) {
        patchCommentaryCache(queryClient, matchId, data.commentary);
        setLatestCommentary(data.commentary);
        setDeliveryVersion((v) => v + 1);
      }
    };

    const onDelivery = (data: WsDeliveryPayload & { commentary?: Commentary }) => {
      applyDeliveryUpdate(data);
    };

    const onWicket = (data: WsDeliveryPayload & { commentary?: Commentary }) => {
      applyDeliveryUpdate(data);
    };

    const onOver = () => {
      refetchMatchCache(queryClient, matchId);
    };

    const onMilestone = (data: MilestoneToast) => {
      setMilestoneToast({ text: data.text, type: data.type });
      setTimeout(() => setMilestoneToast(null), 5000);
    };

    const onPrediction = (data: PredictionEvent) => {
      setPrediction(data);
    };

    const onStatus = (data: StatusEvent) => {
      if (data.status === 'innings_break' || data.status === 'rain_delay') {
        setBreakStatus(data.status);
      } else if (data.status === 'live') {
        setBreakStatus(null);
      }
      patchMatchStatus(queryClient, matchId, data.status);
      if (data.status === 'completed' || data.status === 'abandoned') {
        refetchMatchCache(queryClient, matchId);
      }
    };

    const onDlsUpdate = (data: DLSUpdateEvent) => {
      if (data.revised_target != null) {
        setDlsTarget(data.revised_target);
      }
    };

    socket.on(deliveryEvent, onDelivery);
    socket.on(wicketEvent, onWicket);
    socket.on(overEvent, onOver);
    socket.on(milestoneEvent, onMilestone);
    socket.on(predictionEvent, onPrediction);
    socket.on(statusEvent, onStatus);
    socket.on(dlsEvent, onDlsUpdate);

    return () => {
      leaveMatch(matchId);
      socket.off(deliveryEvent, onDelivery);
      socket.off(wicketEvent, onWicket);
      socket.off(overEvent, onOver);
      socket.off(milestoneEvent, onMilestone);
      socket.off(predictionEvent, onPrediction);
      socket.off(statusEvent, onStatus);
      socket.off(dlsEvent, onDlsUpdate);
    };
  }, [matchId, queryClient, updateFromDelivery]);

  return {
    milestoneToast,
    prediction,
    breakStatus,
    dlsTarget,
    setBreakStatus,
    latestCommentary,
    deliveryVersion,
    setLatestCommentary,
    setDeliveryVersion,
  };
}
