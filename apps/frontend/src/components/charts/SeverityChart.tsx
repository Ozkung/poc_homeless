'use client';
import { useEffect, useRef } from 'react';
import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';
import { useIsMobile } from '@/hooks/useIsMobile';

interface SeverityChartProps {
  critical: number;
  pending: number;
  stable: number;
}

const COLORS = { critical: '#ff4d4f', pending: '#faad14', stable: '#52c41a' };

export default function SeverityChart({ critical, pending, stable }: SeverityChartProps) {
  const isMobile = useIsMobile();
  const donutRef = useRef<Highcharts.Chart | null>(null);
  const columnRef = useRef<Highcharts.Chart | null>(null);
  const donutContainerRef = useRef<HTMLDivElement>(null);
  const columnContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const donutEl = donutContainerRef.current;
    const columnEl = columnContainerRef.current;
    if (!donutEl || !columnEl) return;
    const ro = new ResizeObserver(() => {
      donutRef.current?.reflow();
      columnRef.current?.reflow();
    });
    ro.observe(donutEl);
    ro.observe(columnEl);
    return () => ro.disconnect();
  }, []);

  const total = critical + pending + stable;

  const donutOptions: Highcharts.Options = {
    chart: {
      type: 'pie',
      height: isMobile ? 140 : 160,
      margin: [0, 0, 0, 0],
      backgroundColor: 'transparent',
    },
    title: { text: undefined },
    credits: { enabled: false },
    legend: { enabled: false },
    tooltip: { pointFormat: '<b>{point.y} ราย</b> ({point.percentage:.0f}%)' },
    plotOptions: {
      pie: {
        innerSize: '62%',
        dataLabels: { enabled: false },
        center: ['50%', '50%'],
      },
    },
    series: [{
      type: 'pie',
      name: 'ความร้ายแรง',
      data: [
        { name: 'วิกฤต',       y: critical, color: COLORS.critical },
        { name: 'รอดำเนินการ', y: pending,  color: COLORS.pending  },
        { name: 'ปกติ',        y: stable,   color: COLORS.stable   },
      ],
    }],
  };

  const columnOptions: Highcharts.Options = {
    chart: {
      type: 'column',
      height: isMobile ? 140 : 160,
      margin: [10, 10, 30, 30],
      backgroundColor: 'transparent',
    },
    title: { text: undefined },
    credits: { enabled: false },
    legend: { enabled: false },
    xAxis: {
      categories: ['วิกฤต', 'รอดำเนินการ', 'ปกติ'],
      lineColor: '#f0f0f0',
      tickLength: 0,
      labels: { style: { fontSize: '10px', color: '#888' } },
    },
    yAxis: {
      title: { text: undefined },
      gridLineColor: '#f5f5f5',
      labels: { style: { fontSize: '10px', color: '#888' } },
    },
    tooltip: { pointFormat: '<b>{point.y} ราย</b>' },
    plotOptions: {
      column: {
        borderRadius: 3,
        colorByPoint: true,
        colors: [COLORS.critical, COLORS.pending, COLORS.stable],
      } as any,
    },
    series: [{ type: 'column', name: 'จำนวน', data: [critical, pending, stable] }],
  };

  return (
    <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 8, alignItems: 'center' }}>
      {/* Donut with centre label */}
      <div
        ref={donutContainerRef}
        style={{
          position: 'relative',
          width: isMobile ? '100%' : 160,
          flexShrink: 0,
        }}
      >
        <HighchartsReact
          highcharts={Highcharts}
          options={donutOptions}
          containerProps={{ style: { width: '100%' } }}
          callback={(chart: Highcharts.Chart) => { donutRef.current = chart; }}
        />
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center', pointerEvents: 'none',
        }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#111', lineHeight: 1 }}>{total}</div>
          <div style={{ fontSize: 9, color: '#aaa' }}>ราย</div>
        </div>
      </div>

      {/* Column chart */}
      <div ref={columnContainerRef} style={{ flex: 1, width: '100%', minWidth: 0 }}>
        <HighchartsReact
          highcharts={Highcharts}
          options={columnOptions}
          containerProps={{ style: { width: '100%' } }}
          callback={(chart: Highcharts.Chart) => { columnRef.current = chart; }}
        />
      </div>
    </div>
  );
}
