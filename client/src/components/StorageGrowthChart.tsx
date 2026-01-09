import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

interface DataPoint {
  timestamp: string;
  value: number;
}

interface StorageGrowthChartProps {
  data: DataPoint[];
  projectedData?: DataPoint[];
  title?: string;
  valueLabel?: string;
  valueFormatter?: (value: number) => string;
  averageGrowthPerDay?: number;
  projectedValue?: number;
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
};

const StorageGrowthChart: React.FC<StorageGrowthChartProps> = ({
  data,
  projectedData,
  title = 'Storage Growth',
  valueLabel = 'Size',
  valueFormatter = formatBytes,
  averageGrowthPerDay,
  projectedValue,
}) => {
  // Combine historical and projected data
  const combinedData = [...data];
  if (projectedData && projectedData.length > 0) {
    // Mark the last historical point as the projection start
    const lastHistorical = data[data.length - 1];
    if (lastHistorical) {
      combinedData.push({
        ...lastHistorical,
        projected: lastHistorical.value,
      } as DataPoint & { projected?: number });
    }
    projectedData.forEach((point) => {
      combinedData.push({
        ...point,
        value: undefined as unknown as number,
        projected: point.value,
      } as DataPoint & { projected?: number });
    });
  }

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatDateTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Calculate Y-axis domain with some padding
  const allValues = [
    ...data.map((d) => d.value),
    ...(projectedData || []).map((d) => d.value),
  ].filter((v) => v !== undefined);
  const minValue = Math.min(...allValues);
  const maxValue = Math.max(...allValues);
  const padding = (maxValue - minValue) * 0.1;

  return (
    <div className="bg-white/5 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-mhc-text font-medium">{title}</h4>
        {averageGrowthPerDay !== undefined && (
          <div className="flex items-center gap-4 text-sm">
            <span className="text-mhc-text-muted">
              Avg growth: <span className="text-mhc-text font-medium">{valueFormatter(averageGrowthPerDay)}/day</span>
            </span>
            {projectedValue !== undefined && (
              <span className="text-mhc-text-muted">
                Projected: <span className="text-blue-400 font-medium">{valueFormatter(projectedValue)}</span>
              </span>
            )}
          </div>
        )}
      </div>

      {data.length > 0 ? (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart
            data={combinedData}
            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
            <XAxis
              dataKey="timestamp"
              tickFormatter={formatDate}
              stroke="rgba(255,255,255,0.5)"
              fontSize={12}
            />
            <YAxis
              tickFormatter={valueFormatter}
              stroke="rgba(255,255,255,0.5)"
              fontSize={12}
              domain={[minValue - padding, maxValue + padding]}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(30, 30, 40, 0.95)',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '8px',
              }}
              labelFormatter={formatDateTime}
              formatter={(value, name) => {
                if (value === undefined || value === null) return ['N/A', name || ''];
                return [
                  valueFormatter(value as number),
                  name === 'projected' ? 'Projected' : valueLabel,
                ];
              }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#10b981"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: '#10b981' }}
              connectNulls={false}
            />
            {projectedData && projectedData.length > 0 && (
              <Line
                type="monotone"
                dataKey="projected"
                stroke="#3b82f6"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
                activeDot={{ r: 4, fill: '#3b82f6' }}
                connectNulls
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-[300px] flex items-center justify-center text-mhc-text-muted">
          No data available for the selected time range
        </div>
      )}

      {projectedData && projectedData.length > 0 && (
        <div className="flex items-center gap-4 mt-2 text-xs text-mhc-text-muted">
          <div className="flex items-center gap-1">
            <span className="w-4 h-0.5 bg-emerald-500"></span>
            <span>Historical</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-4 h-0.5 bg-blue-500" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #3b82f6 0, #3b82f6 5px, transparent 5px, transparent 10px)' }}></span>
            <span>Projected</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default StorageGrowthChart;
