#!/bin/bash
# Publish flow: bump version, commit, tag, push

set -e

# Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo "Current version: $CURRENT_VERSION"

# Prompt for new version (patch | minor | major | custom)
read -p "Enter new version (or 'patch', 'minor', 'major', or exact like '1.0.3'): " NEW_VERSION

# Handle semantic version shortcuts
if [ "$NEW_VERSION" = "patch" ]; then
  NEW_VERSION=$(node -p "const v=require('./package.json').version.split('.');v[2]++;v.join('.')")
elif [ "$NEW_VERSION" = "minor" ]; then
  NEW_VERSION=$(node -p "const v=require('./package.json').version.split('.');v[1]++;v[2]=0;v.join('.')")
elif [ "$NEW_VERSION" = "major" ]; then
  NEW_VERSION=$(node -p "const v=require('./package.json').version.split('.');v[0]++;v[1]=0;v[2]=0;v.join('.')")
fi

echo "New version: $NEW_VERSION"

# Confirm
read -p "Proceed with release v$NEW_VERSION? (y/n): " CONFIRM
if [ "$CONFIRM" != "y" ]; then
  echo "Aborted."
  exit 1
fi

# 1. Update version in package.json
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.version = '$NEW_VERSION';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"
echo "✓ Updated package.json to v$NEW_VERSION"

# 2. Commit
git add package.json
git commit -m "release: v$NEW_VERSION"
echo "✓ Created commit"

# 3. Create tag
git tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION"
echo "✓ Created tag v$NEW_VERSION"

# 4. Push commits and tags
git push origin main --tags
echo "✓ Pushed to origin/main with tags"

echo ""
echo "🎉 Published v$NEW_VERSION!"
