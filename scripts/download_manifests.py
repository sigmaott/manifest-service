#!/usr/bin/env python2
# -*- coding: utf-8 -*-

"""
Script to download HLS and DASH manifests and store them in Redis.
For HLS manifests, it also downloads referenced playlists.
"""

import sys
import os
import urllib2
import urlparse
import re
import redis

# Redis connection settings
REDIS_HOST = 'localhost'
REDIS_PORT = 6379

# Manifest URLs
HLS_URL = 'https://live-ads-ali5.tv360.vn/manifest/SSAI-Test/master.m3u8'
DASH_URL = 'https://live-ads-ali5.tv360.vn/manifest/SSAI-Test/master.mpd'

# Redis keys
HLS_KEY = 'manifest/SSAI-Test/master.m3u8'
DASH_KEY = 'manifest/SSAI-Test/master.mpd'

def connect_to_redis():
    """Connect to Redis server and return client."""
    try:
        client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT)
        client.ping()  # Test connection
        print("Connected to Redis at {}:{}".format(REDIS_HOST, REDIS_PORT))
        return client
    except Exception as e:
        print("Error connecting to Redis: {}".format(e))
        sys.exit(1)

def download_content(url):
    """Download content from URL."""
    try:
        request = urllib2.Request(url)
        response = urllib2.urlopen(request)
        content = response.read()
        return content
    except Exception as e:
        print("Error downloading {}: {}".format(url, e))
        return None

def write_to_redis(client, key, content):
    """Write content to Redis with given key."""
    try:
        client.set(key, content)
        print("Successfully wrote {} to Redis".format(key))
        return True
    except Exception as e:
        print("Error writing to Redis: {}".format(e))
        return False

def parse_hls_manifest(content, base_url):
    """
    Parse HLS manifest and return list of playlist URLs.
    Only returns URLs for .m3u8 files.
    """
    playlist_urls = []
    lines = content.split('\n')
    
    for line in lines:
        line = line.strip()
        # Skip comments and empty lines
        if not line or line.startswith('#'):
            continue
        
        # Handle relative URLs
        if not line.startswith('http'):
            playlist_url = urlparse.urljoin(base_url, line)
        else:
            playlist_url = line
            
        if playlist_url.endswith('.m3u8'):
            playlist_urls.append(playlist_url)
    
    return playlist_urls

def get_relative_path(full_url, base_url):
    """Extract relative path from full URL based on base URL."""
    if full_url.startswith(base_url):
        return full_url[len(base_url):]
    return full_url

def main():
    """Main function to download manifests and store in Redis."""
    # Connect to Redis
    redis_client = connect_to_redis()
    
    # Download and store DASH manifest
    print("Downloading DASH manifest from {}".format(DASH_URL))
    dash_content = download_content(DASH_URL)
    if dash_content:
        write_to_redis(redis_client, DASH_KEY, dash_content)
    
    # Download and store HLS manifest
    print("Downloading HLS manifest from {}".format(HLS_URL))
    hls_content = download_content(HLS_URL)
    if hls_content:
        write_to_redis(redis_client, HLS_KEY, hls_content)
        
        # Parse HLS manifest for additional playlists
        base_url = HLS_URL[:HLS_URL.rfind('/')+1]
        playlist_urls = parse_hls_manifest(hls_content, base_url)
        
        # Download and store each playlist
        for playlist_url in playlist_urls:
            print("Downloading playlist from {}".format(playlist_url))
            playlist_content = download_content(playlist_url)
            if playlist_content:
                # Get relative path for Redis key
                base_domain = 'https://live-ads-ali5.tv360.vn/'
                relative_key = 'manifest/' + get_relative_path(playlist_url, base_domain)
                write_to_redis(redis_client, relative_key, playlist_content)
                
                # Check if this is a variant playlist that might contain more m3u8 files
                if '#EXT-X-STREAM-INF' not in hls_content and playlist_content:
                    nested_urls = parse_hls_manifest(playlist_content, base_url)
                    for nested_url in nested_urls:
                        print("Downloading nested playlist from {}".format(nested_url))
                        nested_content = download_content(nested_url)
                        if nested_content:
                            nested_key = 'manifest/' + get_relative_path(nested_url, base_domain)
                            write_to_redis(redis_client, nested_key, nested_content)
    
    print("Manifest download and storage complete.")

if __name__ == "__main__":
    main()
