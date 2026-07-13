/**
 * Clean and validate a JWT token
 * Removes quotes, trims, and validates format
 */
export function cleanToken(token: string): string {
    if (!token) {
        throw new Error('Token is required')
    }
    
    // Remove quotes and trim
    let clean = token.replace(/^"|"$/g, '').trim()
    
    // Check if it has 3 parts (header.payload.signature)
    const parts = clean.split('.')
    if (parts.length !== 3) {
        throw new Error(`Invalid token format: expected 3 parts, got ${parts.length}`)
    }
    
    // Check if each part is not empty
    if (!parts[0] || !parts[1] || !parts[2]) {
        throw new Error('Invalid token: empty parts detected')
    }
    
    return clean
}

/**
 * Check if token is expired (without verifying signature)
 * Useful for client-side checks
 */
export function isTokenExpired(token: string): boolean {
    try {
        const clean = cleanToken(token)
        const payload = JSON.parse(atob(clean.split('.')[1]))
        const exp = payload.exp
        if (!exp) return true
        return Date.now() >= exp * 1000
    } catch {
        return true
    }
}