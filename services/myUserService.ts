import axios from 'axios';

const NEXT_PUBLIC_API_URL = '/api';

export async function fetchCurrentUser() {
    const res = await axios.get(`${NEXT_PUBLIC_API_URL}/auth/me`, {
        withCredentials: true,
    });
    return res.data.user;
}

export async function fetchUpdateCurrentUser(data: any) {
    try {
        const res = await axios.put(`${NEXT_PUBLIC_API_URL}/auth/me`, data, {
            withCredentials: true,
        });
        return res.data.user;
    } catch (error: any) {
        throw error;
    }
}