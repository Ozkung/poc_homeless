'use client';
import { useEffect, useRef } from 'react';
import Highcharts from 'highcharts';

// Load streamgraph module once per session
let moduleLoaded = false;
function ensureModule() {
  if (!moduleLoaded) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('highcharts/modules/streamgraph')(Highcharts);
    moduleLoaded = true;
  }
}

const STATUS_COLOR: Record<string, string> = {
  DONE:        '#52c41a',
  IN_PROGRESS: '#1677ff',
  PENDING:     '#faad14',
  NOT_FOUND:   '#d9d9d9',
};

const STATUS_LABEL: Record<string, string> = {
  DONE:        'เสร็จแล้ว',
  IN_PROGRESS: 'กำลังดำเนินการ',
  PENDING:     'รอดำเนินการ',
  NOT_FOUND:   'ไม่พบผู้ป่วย',
};

interface Props {
  months: string[];
  series: { name: string; data: number[] }[];
}

export default function TaskStreamgraph({ months, series }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Highcharts.Chart | null>(null);

  useEffect(() => {
    if (!containerRef.current || !months.length) return;
    ensureModule();

    const thaiMonths = months.map((m) => {
      const [y, mo] = m.split('-');
      return new Date(Number(y), Number(mo) - 1, 1)
        .toLocaleDateString('th-TH', { month: 'short', year: '2-digit' });
    });

    chartRef.current?.destroy();
    chartRef.current = Highcharts.chart(containerRef.current, {
      chart: {
        type: 'streamgraph',
        backgroundColor: 'transparent',
        height: 200,
        margin: [10, 10, 40, 10],
        style: { fontFamily: 'inherit' },
      },
      title: { text: undefined },
      xAxis: {
        categories: thaiMonths,
        labels: { style: { fontSize: '10px', color: '#999' } },
        lineColor: 'transparent',
        tickColor: 'transparent',
      },
      yAxis: { visible: false, startOnTick: false, endOnTick: false },
      legend: {
        enabled: true,
        align: 'center',
        verticalAlign: 'bottom',
        itemStyle: { fontSize: '10px', fontWeight: '400', color: '#666' },
        symbolRadius: 4,
        margin: 4,
      },
      tooltip: {
        shared: true,
        headerFormat: '<b>{point.key}</b><br/>',
        pointFormat: '<span style="color:{point.color}">●</span> {series.name}: <b>{point.y}</b><br/>',
      },
      plotOptions: { series: { lineWidth: 0, marker: { enabled: false } } },
      series: series.map((s) => ({
        type: 'streamgraph' as const,
        name: STATUS_LABEL[s.name] ?? s.name,
        data: s.data,
        color: STATUS_COLOR[s.name] ?? '#ccc',
      })),
      credits: { enabled: false },
    });

    return () => { chartRef.current?.destroy(); chartRef.current = null; };
  }, [months, series]);

  return <div ref={containerRef} />;
}
