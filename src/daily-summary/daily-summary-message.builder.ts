import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Decimal from 'decimal.js';
import { NSE_TIMEZONE } from '../common/utils/market-time';
import {
  DailyCandidateSummaryItem,
  DailySummary,
  DailyTradeSummaryItem,
} from './models/daily-summary.model';

@Injectable()
export class DailySummaryMessageBuilder {
  constructor(private readonly config: ConfigService) {}

  build(summary: DailySummary): string {
    const maxLength = this.config.getOrThrow<number>('dailySummary.maxMessageLength');
    const lines: string[] = [
      `📊 Daily Trading Summary — ${displayDate(summary.marketDate)}`,
      '',
      `Pipeline: ${summary.pipeline.status}`,
    ];
    if (summary.pipeline.failedAnalysisCount > 0) {
      lines.push(`${summary.pipeline.failedAnalysisCount} candidate analysis failure(s)`);
    }

    lines.push(
      '',
      summary.market.regime ? `Market: ${summary.market.regime}` : 'Market: unavailable',
    );
    if (summary.market.score || summary.market.confidence) {
      lines.push(
        [
          summary.market.score ? `Score ${summary.market.score}` : null,
          summary.market.confidence ? `Confidence ${summary.market.confidence}` : null,
        ]
          .filter(Boolean)
          .join(' | '),
      );
    }

    lines.push('', '🔎 Scan');
    if (summary.scan.status === 'SUCCESS') {
      lines.push(
        `${summary.scan.totalUniverse ?? 0} stocks in universe`,
        `${summary.scan.evaluatedSymbols ?? 0} stocks evaluated`,
        `${summary.scan.qualifiedSetups ?? 0} setups qualified`,
        `${summary.scan.shortlistedSetups ?? 0} shortlisted`,
      );
    } else {
      lines.push(
        summary.scan.status === 'FAILED'
          ? 'Scan failed / data unavailable'
          : 'Scan did not run / data unavailable',
      );
    }

    lines.push(
      '',
      `✅ Qualified: ${summary.candidates.qualifiedCount}`,
      `⏳ Wait: ${summary.candidates.waitCount}`,
      `❌ Rejected: ${summary.candidates.rejectedCount}`,
    );
    if (summary.candidates.qualifiedCount === 0 && summary.scan.status === 'SUCCESS') {
      lines.push('No qualified setups today.');
    }

    lines.push(
      '',
      '📈 Portfolio',
      `Open trades: ${summary.portfolio.openTrades}`,
      `Position value: ${money(summary.portfolio.currentPositionValue)}`,
      `Unrealized: ${signedMoney(summary.portfolio.unrealizedPnl)}`,
      `Realized today: ${signedMoney(summary.portfolio.realizedPnlToday)}`,
      `Open risk: ${money(summary.portfolio.openRisk)} / ${money(summary.portfolio.maxPortfolioRisk)}`,
    );
    if (summary.portfolio.openTrades === 0) lines.push('No open trades.');

    if (summary.candidates.qualified.length) {
      lines.push('', 'Top Candidates');
      summary.candidates.qualified.forEach((candidate, index) => {
        lines.push('', ...candidateLines(candidate, index + 1));
      });
    }

    if (summary.trades.length) {
      lines.push('', 'Open Trade Details');
      for (const trade of summary.trades) lines.push('', ...tradeLines(trade));
    }

    if (summary.warnings.length) {
      lines.push('', '⚠️ Warnings');
      for (const warning of summary.warnings.slice(0, 6)) lines.push(`• ${truncate(warning, 180)}`);
    }
    const message = lines.join('\n');
    if (message.length <= maxLength) return message;

    const firstDetail =
      [lines.indexOf('Top Candidates'), lines.indexOf('Open Trade Details')]
        .filter((index) => index >= 0)
        .sort((left, right) => left - right)[0] ?? lines.length;
    const compact = [
      ...lines.slice(0, firstDetail),
      ...(summary.candidates.qualified.length
        ? [
            '',
            'Top Candidates',
            ...summary.candidates.qualified.flatMap((candidate, index) => [
              `${index + 1}. ${candidate.symbol} — ${title(candidate.strategy)}`,
              `Rank ${candidate.globalRank ? `#${candidate.globalRank}` : 'N/A'} | Entry ${money(candidate.plannedEntry)} | Stop ${money(candidate.stop)}`,
            ]),
          ]
        : []),
      '',
      `Open trade details limited; ${summary.portfolio.openTrades} trade(s) are tracked.`,
      ...(summary.warnings.length
        ? [
            '',
            '⚠️ Warnings',
            ...summary.warnings.slice(0, 3).map((warning) => `• ${truncate(warning, 140)}`),
          ]
        : []),
    ].join('\n');
    return compact.length <= maxLength ? compact : `${compact.slice(0, maxLength - 1)}…`;
  }
}

function candidateLines(candidate: DailyCandidateSummaryItem, position: number): string[] {
  const lines = [
    `${position}. ${candidate.symbol} — ${title(candidate.strategy)}`,
    `Rank ${candidate.globalRank ? `#${candidate.globalRank}` : 'N/A'} | Score ${candidate.rankingScore ?? 'N/A'} | ${candidate.notificationStatus}`,
    `Entry ${money(candidate.plannedEntry)} | Stop ${money(candidate.stop)} | Qty ${candidate.quantity}`,
    `Risk ${money(candidate.plannedRisk)}`,
  ];
  if (candidate.aiSummary) lines.push(`AI: ${truncate(candidate.aiSummary, 180)}`);
  if (candidate.primaryRisk) lines.push(`Risk note: ${truncate(candidate.primaryRisk, 140)}`);
  return lines;
}

function tradeLines(trade: DailyTradeSummaryItem): string[] {
  const stale = trade.priceStatus === 'CURRENT' ? '' : ` | ${trade.priceStatus}`;
  const observed = trade.priceObservedAt ? ` | ${displayTime(trade.priceObservedAt)}` : '';
  return [
    trade.symbol,
    `Qty ${trade.quantity} | Entry ${money(trade.entry)} | Price ${money(trade.currentPrice)}${stale}${observed}`,
    `R ${signed(trade.currentR)} | P&L ${signedMoney(trade.unrealizedPnl)} | Stop ${money(trade.currentStop)}`,
  ];
}

function displayDate(marketDate: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: NSE_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${marketDate}T12:00:00+05:30`));
}

function displayTime(value: string): string {
  return (
    new Intl.DateTimeFormat('en-IN', {
      timeZone: NSE_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(value)) + ' IST'
  );
}

function money(value: string | null): string {
  if (value === null) return 'unavailable';
  const amount = new Decimal(value);
  return `${amount.isNegative() ? '-' : ''}₹${amount.abs().toDecimalPlaces(2).toFixed(2)}`;
}

function signedMoney(value: string | null): string {
  if (value === null) return 'unavailable';
  const amount = new Decimal(value);
  return `${amount.isPositive() ? '+' : amount.isNegative() ? '-' : ''}₹${amount.abs().toDecimalPlaces(2).toFixed(2)}`;
}

function signed(value: string | null): string {
  if (value === null) return 'unavailable';
  const amount = new Decimal(value);
  return `${amount.isPositive() ? '+' : ''}${amount.toDecimalPlaces(2).toFixed(2)}`;
}

function title(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function truncate(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, limit - 1)}…`;
}
