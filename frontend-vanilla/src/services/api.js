/**
 * REST API client utility
 */

const API_BASE_URL = window.location.origin.includes('localhost')
    ? 'http://localhost:8000'
    : window.location.origin;

/**
 * Fetch wrapper with error handling
 * @param {string} endpoint - API endpoint
 * @param {object} options - Fetch options
 * @returns {Promise<any>} - Response data
 */
async function fetchAPI(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;

    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
        },
    };

    const mergedOptions = {
        ...defaultOptions,
        ...options,
        headers: {
            ...defaultOptions.headers,
            ...(options.headers || {}),
        },
    };

    try {
        const response = await fetch(url, mergedOptions);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
        }

        // Handle 204 No Content
        if (response.status === 204) {
            return null;
        }

        return await response.json();
    } catch (error) {
        console.error(`API Error (${endpoint}):`, error);
        throw error;
    }
}

/**
 * Get all machines
 * @param {object} params - Query parameters
 * @returns {Promise<object>} - Machine list response
 */
export async function getMachines(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = `/api/machines${queryString ? `?${queryString}` : ''}`;
    return fetchAPI(endpoint);
}

/**
 * Register or update a machine
 * @param {string} ipAddress - Machine IP address
 * @param {object} data - Machine data
 * @returns {Promise<object>} - Machine response
 */
export async function upsertMachine(ipAddress, data) {
    return fetchAPI(`/api/machines/${ipAddress}`, {
        method: 'PUT',
        body: JSON.stringify(data),
    });
}

/**
 * Delete a machine
 * @param {number} machineId - Machine ID
 * @returns {Promise<null>}
 */
export async function deleteMachine(machineId) {
    return fetchAPI(`/api/machines/${machineId}`, {
        method: 'DELETE',
    });
}

export default {
    getMachines,
    upsertMachine,
    deleteMachine,
};
