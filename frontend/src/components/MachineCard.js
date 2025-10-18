/**
 * Machine Card Component (Mobile Layout)
 */

import { deleteMachine } from '../services/api.js';

/**
 * Render machine list as cards (mobile layout)
 * @param {Array} machines - Array of machine objects
 * @param {Function} onDelete - Callback when machine is deleted
 * @returns {string} HTML string
 */
export function renderMachineCards(machines, onDelete) {
    if (machines.length === 0) {
        return `
            <div class="empty-state">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <h5>マシンが登録されていません</h5>
                <p>VXLANネットワーク内のマシンから登録スクリプトを実行してください</p>
            </div>
        `;
    }

    const cards = machines.map(machine => {
        const statusClass = machine.status === 'active' ? 'status-active' : 'status-unreachable';
        const statusIcon = machine.status === 'active' ? '●' : '○';
        const statusText = machine.status === 'active' ? '接続中' : '接続不可';
        const responseTime = machine.response_time !== null
            ? `${machine.response_time.toFixed(2)} ms`
            : '-';
        const lastSeen = new Date(machine.last_seen).toLocaleString('ja-JP');

        const deleteButton = machine.status === 'unreachable'
            ? `<button class="btn btn-sm btn-danger btn-delete w-100 mt-2" data-machine-id="${machine.id}" data-machine-name="${machine.hostname}">削除</button>`
            : '';

        return `
            <div class="machine-card" data-machine-id="${machine.id}">
                <div class="card-header">
                    <h6 class="mb-0">${escapeHtml(machine.hostname)}</h6>
                    <span class="badge ${machine.status === 'active' ? 'bg-success' : 'bg-danger'}">
                        ${statusIcon} ${statusText}
                    </span>
                </div>
                <div class="card-body">
                    <div><strong>IPアドレス:</strong> ${machine.ip_address}</div>
                    <div><strong>MACアドレス:</strong> ${machine.mac_address}</div>
                    <div><strong>応答時間:</strong> ${responseTime}</div>
                    <div><strong>最終確認:</strong> ${lastSeen}</div>
                    ${deleteButton}
                </div>
            </div>
        `;
    }).join('');

    // Attach event listeners after rendering
    setTimeout(() => attachDeleteListeners(onDelete), 0);

    return `<div class="machine-cards">${cards}</div>`;
}

/**
 * Attach click listeners to delete buttons
 * @param {Function} onDelete - Callback when delete is confirmed
 */
function attachDeleteListeners(onDelete) {
    const deleteButtons = document.querySelectorAll('.btn-delete');
    deleteButtons.forEach(button => {
        button.addEventListener('click', async (e) => {
            const machineId = parseInt(e.target.dataset.machineId);
            const machineName = e.target.dataset.machineName;

            if (confirm(`マシン "${machineName}" を削除してもよろしいですか？\n\nこの操作は取り消せません。`)) {
                try {
                    await deleteMachine(machineId);
                    onDelete(machineId);
                } catch (error) {
                    alert(`削除エラー: ${error.message}`);
                }
            }
        });
    });
}

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

export default {
    renderMachineCards,
};
