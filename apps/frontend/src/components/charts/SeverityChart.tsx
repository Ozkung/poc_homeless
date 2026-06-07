'use client';
import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';

interface SeverityChartProps {
  critical: number;
  pending: number;
  stable: number;
}

const COLORS = { critical: '#ff4d4f', pending: '#faad14', stable: '#52c41a' };

export default function SeverityChart({ critical, pending, stable }: SeverityChartProps) {
  const total = critical + pending + stable;

  const donutOptions: Highcharts.Options = {
    chart: { type: 'pie', height: 160, margin: [0, 0, 0, 0], backgroundColor: 'transparent' },
    title: { text: undefined },
    credits: { enabled: false },
    legend: { enabled: false },
    tooltip: {
      pointFormat: '<b>{point.y} ราย</b> ({point.percentage:.0f}%)',
    },
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
        { name: 'วิกฤต',         y: critical, color: COLORS.critical },
        { name: 'รอดำเนินการ',   y: pending,  color: COLORS.pending },
        { name: 'ปกติ',          y: stable,   color: COLORS.stable },
      ],
    }],
  };

  const columnOptions: Highcharts.Options = {
    chart: { type: 'column', height: 160, margin: [10, 10, 30, 30], backgroundColor: 'transparent' },
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
    tooltip: {
      pointFormat: '<b>{point.y} ราย</b>',
    },
    plotOptions: {
      column: {
        borderRadius: 3,
        colorByPoint: true,
        colors: [COLORS.critical, COLORS.pending, COLORS.stable],
      } as any,
    },
    series: [{
      type: 'column',
      name: 'จำนวน',
      data: [critical, pending, stable],
    }],
  };

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      {/* Donut with centre label */}
      <div style={{ position: 'relative', width: 160, flexShrink: 0 }}>
        <HighchartsReact highcharts={Highcharts} options={donutOptions} />
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
      <div style={{ flex: 1 }}>
        <HighchartsReact highcharts={Highcharts} options={columnOptions} />
      </div>
    </div>
  );
}
