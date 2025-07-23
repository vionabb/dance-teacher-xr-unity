import { redirect } from "@sveltejs/kit";

export const load = async ({ locals: { session }, }) => {

    if (!session) {
        redirect(303, '/');
    }

    return {}
}