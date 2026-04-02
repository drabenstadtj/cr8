package discovery

import (
	"encoding/json"
	"fmt"

	"explo/src/util"
)

type cr8User struct {
	ListenbrainzUsername string `json:"listenbrainzUsername"`
}

// FetchCr8Users calls the cr8 /api/exploration/users endpoint and returns the
// list of ListenBrainz usernames for users who have set one.
func FetchCr8Users(cr8URL, apiKey string, httpClient *util.HttpClient) ([]string, error) {
	url := fmt.Sprintf("%s/api/exploration/users", cr8URL)
	headers := map[string]string{
		"Authorization": fmt.Sprintf("Bearer %s", apiKey),
	}

	body, err := httpClient.MakeRequest("GET", url, nil, headers)
	if err != nil {
		return nil, fmt.Errorf("FetchCr8Users: %w", err)
	}

	var users []cr8User
	if err := json.Unmarshal(body, &users); err != nil {
		return nil, fmt.Errorf("FetchCr8Users: failed to parse response: %w", err)
	}

	result := make([]string, 0, len(users))
	for _, u := range users {
		if u.ListenbrainzUsername != "" {
			result = append(result, u.ListenbrainzUsername)
		}
	}
	return result, nil
}
