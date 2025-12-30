# Interactive API Documentation

## Statbate Premium API

- 1.0.0
- OAS 3.0
- [Open API](https://plus.statbate.com/openapi.json)

### Servers

- [Production Server](https://plus.statbate.com/api) - Production server

| Method | URL | Description |
| ------ | -------------- | -------- |
| GET | /members | Get Top Members |
| GET | /members/{site}/{name}/activity | Get Member Activity |
| GET | /members/{site}/{name}/info | Get Member Info |
| GET | /members/{site}/{name}/model/{model} | Get Member Model Spending |
| GET | /members/{site}/{name}/tag-spending | Get Member Tag Spending |
| GET | /members/{site}/{name}/tips | Get Member Tips |
| GET | /members/{site}/{name}/top-models | Get Member's Top Models |
| POST | /members/{site}/info/batch | Get Members Info (Batch) |
| GET | /members/online | Best online membersModels |
| GET | /model/{site}/{name}/activity | Get Model Activity |
| GET | /model/{site}/{name}/info | Get Model Info |
| GET | /model/{site}/{name}/members | Get Model Members |
| GET | /model/{site}/{name}/rank | Get Model Rank |
| GET | /model/{site}/{name}/tips | Get Model Tips |
| GET | /models | Get Top ModelsTags |
| GET | /tags | Get Tags |
| GET | /tags/search | Search Tags |
