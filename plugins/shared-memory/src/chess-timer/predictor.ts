// plugins/shared-memory/src/chess-timer/predictor.ts

import type { SessionStore } from './session-store';
import type { Estimate, WorkType } from './types';

export interface EstimateInput {
  feature_id?: string;
  description?: string;
  work_type?: WorkType;
  complexity_rating?: number;
}

export class Predictor {
  constructor(private store: SessionStore) {}

  getEstimate(input: EstimateInput): Estimate {
    // Get completed sessions
    const allSessions = this.store.listSessions({ status: 'completed', limit: 100 });

    // Filter by work type if specified
    let similar = allSessions;
    if (input.work_type) {
      similar = allSessions.filter((s) => {
        const metrics = this.store.getMetrics(s.id);
        if (!metrics || metrics.length === 0) return false;
        // Use the most recent metrics record
        const latestMetrics = metrics[metrics.length - 1];
        return latestMetrics.work_type === input.work_type;
      });
    }

    // Filter by complexity if specified (within +-1)
    if (input.complexity_rating !== undefined) {
      similar = similar.filter((s) => {
        const metrics = this.store.getMetrics(s.id);
        if (!metrics || metrics.length === 0) return false;
        // Use the most recent metrics record
        const latestMetrics = metrics[metrics.length - 1];
        return Math.abs(latestMetrics.complexity_rating - input.complexity_rating!) <= 1;
      });
    }

    // Weight recent sessions higher (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentSessions = similar.filter((s) => s.completed_at && s.completed_at > thirtyDaysAgo);

    // Use recent if we have enough, otherwise use all
    const sessionsToUse = recentSessions.length >= 3 ? recentSessions : similar;

    const sampleCount = sessionsToUse.length;
    const confidence = this.getConfidence(sampleCount);

    if (sampleCount === 0) {
      return {
        min_seconds: 0,
        max_seconds: 0,
        confidence: 'low',
        sample_count: 0,
        similar_sessions: [],
        message: "Hard to say—this is new territory for us.",
      };
    }

    // Calculate duration statistics
    const durations = sessionsToUse.map((s) => s.total_active_seconds);
    const sorted = [...durations].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const min = sorted[0];
    const max = sorted[sorted.length - 1];

    // Build estimate range based on confidence
    let minEstimate: number;
    let maxEstimate: number;
    let message: string;

    if (confidence === 'low') {
      minEstimate = min;
      maxEstimate = max;
      message = `Similar work has taken anywhere from ${this.formatDuration(min)} to ${this.formatDuration(max)}`;
    } else if (confidence === 'medium') {
      const p25Index = Math.floor(sorted.length * 0.25);
      const p75Index = Math.floor(sorted.length * 0.75);
      const p25 = sorted[p25Index];
      const p75 = sorted[p75Index];
      minEstimate = p25;
      maxEstimate = p75;
      message = `Based on ${sampleCount} similar sessions, probably ${this.formatDuration(p25)} to ${this.formatDuration(p75)}`;
    } else {
      // High confidence - tight range around median
      const stdDev = this.calculateStdDev(durations, median);
      minEstimate = Math.max(0, median - stdDev);
      maxEstimate = median + stdDev;
      message = `This usually takes about ${this.formatDuration(median)}`;
    }

    return {
      min_seconds: Math.round(minEstimate),
      max_seconds: Math.round(maxEstimate),
      confidence,
      sample_count: sampleCount,
      similar_sessions: sessionsToUse.slice(0, 3).map((s) => ({
        feature_id: s.feature_id,
        description: s.feature_description,
        duration_seconds: s.total_active_seconds,
      })),
      message,
    };
  }

  private getConfidence(sampleCount: number): 'low' | 'medium' | 'high' {
    if (sampleCount < 5) return 'low';
    if (sampleCount < 15) return 'medium';
    return 'high';
  }

  private calculateStdDev(values: number[], mean: number): number {
    if (values.length === 0) return 0;
    const squareDiffs = values.map((v) => Math.pow(v - mean, 2));
    const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / values.length;
    return Math.sqrt(avgSquareDiff);
  }

  private formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds} seconds`;
    const minutes = Math.round(seconds / 60);
    if (minutes === 1) return '1 minute';
    if (minutes < 60) return `${minutes} minutes`;
    const hours = Math.floor(minutes / 60);
    const remainingMins = minutes % 60;
    if (remainingMins === 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
    return `${hours}h ${remainingMins}m`;
  }
}
