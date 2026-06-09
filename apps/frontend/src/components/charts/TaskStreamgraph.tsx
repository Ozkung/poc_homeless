'use client';
import { useRef, useEffect } from 'react';
import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';

const STATUS_COLOR: Record<string, string> = {
  DONE:        '#52c41a',
  IN_PROGRESS: '#1677ff',
  PENDING:     '#faad14',
  NOT_FOUND:   '#bfbfbf',
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

export default function TaskStackedArea({ months, series }: Props) {
  const chartRef = useRef<HighchartsReact.RefObject>(null);

  const thaiMonths = months.map((m) => {
    const [y, mo] = m.split('-');
    return new Date(Number(y), Number(mo) - 1, 1)
      .toLocaleDateString('th-TH', { month: 'short', year: '2-digit' });
  });

  const options: Highcharts.Options = {
    chart: {
      type: 'area',
      backgroundColor: 'transparent',
      height: 200,
      margin: [10, 10, 40, 30],
      style: { fontFamily: 'inherit' },
      animation: false,
    },
    title: { text: undefined },
    xAxis: {
      categories: thaiMonths,
      labels: { style: { fontSize: '10px', color: '#999' } },
      lineColor: '#f0f0f0',
      tickColor: '#f0f0f0',
    },
    yAxis: {
      title: { text: undefined },
      labels: { style: { fontSize: '10px', color: '#999' } },
      gridLineColor: '#f5f5f5',
      stackLabels: { enabled: false },
    },
    legend: {
      enabled: true,
      align: 'center',
      verticalAlign: 'bottom',
      itemStyle: { fontSize: '10px', fontWeight: '400', color: '#666' },
      symbolRadius: 2,
      margin: 24,
    },
    tooltip: {
      shared: true,
      headerFormat: '<b>{point.key}</b><br/>',
      pointFormat: '<span style="color:{point.color}">●</span> {series.name}: <b>{point.y}</b><br/>',
    },
    plotOptions: {
      area: {
        stacking: 'normal',
        lineWidth: 1,
        marker: { enabled: false },
        fillOpacity: 0.8,
      },
    },
    series: series.map((s) => ({
      type: 'area' as const,
      name: STATUS_LABEL[s.name] ?? s.name,
      data: s.data,
      color: STATUS_COLOR[s.name] ?? '#ccc',
    })),
    credits: { enabled: false },
  };

  return (
    <HighchartsReact
      highcharts={Highcharts}
      options={options}
      ref={chartRef}
    />
  );
}
