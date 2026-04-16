import os from 'node:os';

export function getServerNodeMetadata() {
    return {
        nodeId: process.env.HAPPY_NODE_ID || process.env.NODE_NAME || os.hostname(),
        region: process.env.HAPPY_NODE_REGION || process.env.NODE_NAME || 'unknown',
        role: process.env.HAPPY_NODE_ROLE || 'app',
        publicUrl: process.env.PUBLIC_URL || null,
        version: process.env.npm_package_version || '0.0.0',
    };
}
