import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface DataPoint {
  date: string;
  value: number;
  value2?: number;
  delta?: number | null;
}

interface ProfileHistoryChartProps {
  title: string;
  data: DataPoint[];
  valueFormatter?: (value: number) => string;
  color?: string;
  color2?: string;
  label2?: string;
  height?: number;
  invertYAxis?: boolean;
}

const ProfileHistoryChart: React.FC<ProfileHistoryChartProps> = ({
  title,
  data,
  valueFormatter = (v) => v.toLocaleString(),
  color = '#10b981',
  color2,
  label2,
  height = 200,
  invertYAxis = false,
}) => {
  if (!data || data.length === 0) return null;

  const formatDate = (date: string) => {
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const allValues = data.flatMap((d) => {
    const vals = [d.value];
    if (d.value2 !== undefined) vals.push(d.value2);
    return vals;
  }).filter((v) => v !== undefined && v !== null);

  const minValue = Math.min(...allValues);
  const maxValue = Math.max(...allValues);
  const padding = (maxValue - minValue) * 0.1 || 1;

  const domain: [number, number] = invertYAxis
    ? [maxValue + padding, Math.max(1, minValue - padding)]
    : [minValue - padding, maxValue + padding];

  return (
    <div>
      <h5 className="text-mhc-text-muted text-sm font-medium mb-2">{title}</h5>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            stroke="rgba(255,255,255,0.4)"
            fontSize={11}
            tick={{ fill: 'rgba(255,255,255,0.5)' }}
          />
          <YAxis
            tickFormatter={valueFormatter}
            stroke="rgba(255,255,255,0.4)"
            fontSize={11}
            tick={{ fill: 'rgba(255,255,255,0.5)' }}
            domain={domain}
            allowDataOverflow
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'rgba(30, 30, 40, 0.95)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '8px',
              fontSize: '12px',
            }}
            labelFormatter={(label) => {
              const d = new Date(label);
              return d.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              });
            }}
            formatter={(value, name) => {
              if (value === undefined || value === null) return ['N/A', name || ''];
              const displayLabel = name === 'value2' ? (label2 || 'Value 2') : title;
              return [valueFormatter(value as number), displayLabel];
            }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3, fill: color }}
          />
          {color2 && (
            <Line
              type="monotone"
              dataKey="value2"
              stroke={color2}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3, fill: color2 }}
              strokeDasharray="4 2"
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default ProfileHistoryChart;
