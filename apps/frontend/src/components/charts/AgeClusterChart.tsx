'use client';
import { useEffect, useRef } from 'react';
import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';

export interface AgeBand {
  label: string;
  critical: number;
  pending: number;
  stable: number;
}

interface AgeClusterChartProps {
  bands: AgeBand[];
}

export default function AgeClusterChart({ bands }: AgeClusterChartProps) {
  const chartRef = useRef<Highcharts.Chart | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => chartRef.current?.reflow());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const options: Highcharts.Options = {
    chart: {
      type: 'column',
      height: 220,
      margin: [20, 10, 50, 40],
      backgroundColor: 'transparent',
    },
    title: { text: undefined },
    credits: { enabled: false },
    xAxis: {
      categories: bands.map((b) => b.label),
      lineColor: '#f0f0f0',
      tickLength: 0,
      labels: { style: { fontSize: '11px', color: '#555' } },
    },
    yAxis: {
      title: { text: undefined },
      gridLineColor: '#f5f5f5',
      labels: { style: { fontSize: '10px', color: '#888' } },
      stackLabels: {
        enabled: true,
        style: { fontWeight: '700', color: '#555', fontSize: '10px' },
      },
    },
    legend: {
      align: 'center',
      verticalAlign: 'bottom',
      itemStyle: { fontSize: '11px', color: '#555', fontWeight: '500' },
    },
    tooltip: {
      shared: true,
      useHTML: true,
      headerFormat: '<b style="font-size:12px">{point.key}</b><br/>',
      pointFormat: '<span style="color:{point.color}">●</span> {series.name}: <b>{point.y} ราย</b><br/>',
    },
    plotOptions: {
      column: {
        stacking: 'normal',
        borderRadius: 3,
        groupPadding: 0.15,
      },
    },
    series: [
      { type: 'column', name: 'วิกฤต',         color: '#ff4d4f', data: bands.map((b) => b.critical) },
      { type: 'column', name: 'รอดำเนินการ',   color: '#faad14', data: bands.map((b) => b.pending)  },
      { type: 'column', name: 'ปกติ',          color: '#52c41a', data: bands.map((b) => b.stable)   },
    ],
  };

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      <HighchartsReact
        highcharts={Highcharts}
        options={options}
        containerProps={{ style: { width: '100%' } }}
        callback={(chart: Highcharts.Chart) => { chartRef.current = chart; }}
      />
    </div>
  );
}
