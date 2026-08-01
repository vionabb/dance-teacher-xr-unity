# A file to help github copilot cloud agents 
# configure rclone to access the research dataset on google drive using a service account
#
#
# Steps:
# 1. Get contents of RESEARCH_DATASET_GOOGLEDRIVE_SERVICE_ACCOUNT agent secret and put it into ~/.config/rclone/researchdataset-googledrive-serviceaccount.json
# 2. Copy the rclone-template.conf into your home directory as ~/.config/rclone/rclone.conf and replace the <service-account-json-path> with the above path to your service account json file.
# 3. Replace the folder ids with the correspondingly named agent variables

set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
rclone_dir="${RCLONE_CONFIG_DIR:-${HOME}/.config/rclone}"
template_file="${script_dir}/rclone-template.conf"
service_account_file="${rclone_dir}/researchdataset-googledrive-serviceaccount.json"
config_file="${rclone_dir}/rclone.conf"

command -v rclone >/dev/null 2>&1 || {
	printf 'rclone is not installed or not on PATH\n' >&2
	exit 1
}

# Push/pull-request validation runs do not receive Copilot Agents secrets.
# Set RCLONE_REQUIRE_AUTH=1 as an Agents variable to make cloud-agent setup
# fail loudly when its Agents secrets are missing or incomplete. Ordinary CI
# leaves it unset and performs only the installation check.
if [[ -z "${RESEARCH_DATASET_GOOGLEDRIVE_SERVICE_ACCOUNT:-}" ]]; then
	if [[ "${RCLONE_REQUIRE_AUTH:-0}" == "1" ]]; then
		printf 'RCLONE_REQUIRE_AUTH=1 but Agents credentials are unavailable. Configure the repository Agents secrets.\n' >&2
		exit 1
	fi
	printf 'Agents secrets are unavailable; rclone installation check passed.\n'
	exit 0
fi

: "${RESEARCH_DATASET_GOOGLEDRIVE_SERVICE_ACCOUNT:?RESEARCH_DATASET_GOOGLEDRIVE_SERVICE_ACCOUNT is required}"
: "${RCLONE_FOLDERID_DATASET_READONLY:?RCLONE_FOLDERID_DATASET_READONLY is required}"
: "${RCLONE_FOLDERID_AGENTOUTPUT:?RCLONE_FOLDERID_AGENTOUTPUT is required}"
: "${RCLONE_FOLDERID_PROCESSEDMEDIABUNDLE:?RCLONE_FOLDERID_PROCESSEDMEDIABUNDLE is required}"

if [[ ! -f "${template_file}" ]]; then
	printf 'rclone template not found: %s\n' "${template_file}" >&2
	exit 1
fi

umask 077
mkdir -p "${rclone_dir}"
printf '%s' "${RESEARCH_DATASET_GOOGLEDRIVE_SERVICE_ACCOUNT}" > "${service_account_file}"

config="$(<"${template_file}")"
config="${config//<service-account-json-path>/${service_account_file}}"
config="${config//\$RCLONE_FOLDERID_DATASET_READONLY/${RCLONE_FOLDERID_DATASET_READONLY}}"
config="${config//\$RCLONE_FOLDERID_AGENTOUTPUT/${RCLONE_FOLDERID_AGENTOUTPUT}}"
config="${config//\$RCLONE_FOLDERID_PROCESSEDMEDIABUNDLE/${RCLONE_FOLDERID_PROCESSEDMEDIABUNDLE}}"
printf '%s\n' "${config}" > "${config_file}"

# Read-only smoke checks. These do not download, upload, delete, or modify Drive.
rclone lsf --max-depth 1 dataset: >/dev/null
rclone lsf --max-depth 1 agentoutput: >/dev/null
rclone lsf --max-depth 1 processedmediabundle: >/dev/null
printf 'rclone remotes configured and readable: dataset, agentoutput, processedmediabundle\n'
