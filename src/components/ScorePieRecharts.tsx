import React from 'react';
import { PieChart, Pie, Cell } from 'recharts';

export default function ScorePieRecharts({ value, size = 140, color = 'var(--accent-color)', label = 'Match' }: { value: number; size?: number; color?: string; label?: string; }) {
    const v = Math.max(0, Math.min(100, value || 0));
    const data = [
        { name: 'score', value: v },
        { name: 'rest', value: 100 - v }
    ];
    const cx = size / 2;
    const cy = size / 2;

    return (
        <div style={{ width: size, height: size, position: 'relative' }}>
            <PieChart width={150} height={150}>
                <Pie
                    data={data}
                    dataKey="value"
                    innerRadius={size * 0.32}
                    outerRadius={size * 0.48}
                    startAngle={90}
                    endAngle={-270}
                    cx={cx}
                    cy={cy}
                    stroke="none"
                >
                    <Cell fill={color} />
                    <Cell fill="#e5e7eb" />
                </Pie>
            </PieChart>
            <div className="absolute inset-0 flex flex-col justify-center items-center content-center pl-2">
                <div className="text-[18px] font-bold">{Math.round(v)}%</div>
                <div className="text-[11px]">{label}</div>
            </div>
        </div>
    );
}