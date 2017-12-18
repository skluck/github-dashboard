$.url_param = function(name, url) {
    var uri = url || window.location.href,
        results = new RegExp('[\?&]' + name + '=([^&#]*)').exec(uri);
    if (!results) return null;
    return results[1] || null;
};

$.combinator = function (promises) {
    var accumulator = [];
    var ready = Promise.resolve(null);

    promises.forEach(function (promise, i) {
        ready = ready.then(function () {
            return promise;
        }).then(function (value) {
            accumulator[i] = value;
        });
    });

    return ready.then(function () { return accumulator; });
}

$.local_date = function (value) {
    if (value.length === 0) return '';
    if (typeof value !== 'string') return '';

    var d = new Date(value);

    return [
        d.getFullYear(),
        "0".concat(d.getMonth() + 1).slice(-2),
        "0".concat(d.getDate()).slice(-2)
    ].join('-');
};

Vue.filter('local_date', $.local_date);

let oldest = new Date();
oldest.setDate(oldest.getDate() - 30);

let recent = new Date();
recent.setDate(recent.getDate() - 3);

new Vue({
    el: '#vue-application',
    data: {
        oldest: oldest,
        recent: recent,

        github_base_url: 'https://api.github.com',
        enterprise_base_url: '',

        gh: null,
        ghe: null,
        default_max: 6,

        github_repos: [],
        enterprise_repos: [],

        milestones: [],
        projects: [],
        pullrequests: [],
    },
    created: function() {
        let enterprise_url = store.get('enterprise_url');
        let enterprise_repos = store.get('enterprise_repos');
        let github_repos = store.get('github_repos');

        if (enterprise_url) {
            this.enterprise_base_url = enterprise_url;
        }

        if (enterprise_repos) {
            this.enterprise_repos = enterprise_repos;
        }

        if (github_repos) {
            this.github_repos = github_repos;
        }

        let max_gh = (this.github_repos.length > this.default_max) ? this.github_repos.length : this.default_max;
        let max_ghe = (this.enterprise_repos.length > this.default_max) ? this.enterprise_repos.length : this.default_max;
        this.populateDefaultRepos(max_gh, max_ghe);
    },

    methods: {
        populateDefaultRepos: function(max_gh, max_ghe) {
            for (let i = 0; i < max_gh; i++) {
                if (!this.github_repos[i]) {
                    this.github_repos[i] = {url: '', visible: true, owner: '', repo: ''};
                } else {
                    if (!this.github_repos[i].hasOwnProperty('url')) this.github_repos[i].url = '';
                    if (!this.github_repos[i].hasOwnProperty('visible')) this.github_repos[i].visible = true;
                    if (!this.github_repos[i].hasOwnProperty('owner')) this.github_repos[i].owner = '';
                    if (!this.github_repos[i].hasOwnProperty('repo')) this.github_repos[i].repo = '';
                }
            }

            for (let i = 0; i < max_ghe; i++) {
                if (!this.enterprise_repos[i]) {
                    this.enterprise_repos[i] = {url: '', visible: true, owner: '', repo: ''};
                } else {
                    if (!this.enterprise_repos[i].hasOwnProperty('url')) this.enterprise_repos[i].url = '';
                    if (!this.enterprise_repos[i].hasOwnProperty('visible')) this.enterprise_repos[i].visible = true;
                    if (!this.enterprise_repos[i].hasOwnProperty('owner')) this.enterprise_repos[i].owner = '';
                    if (!this.enterprise_repos[i].hasOwnProperty('repo')) this.enterprise_repos[i].repo = '';
                }
            }
        },

        load: function() {
            store.set('enterprise_url', this.enterprise_base_url);
            store.set('enterprise_repos', this.enterprise_repos);
            store.set('github_repos', this.github_repos);

            this.gh = new GitHub({/*token: 'MY_OAUTH_TOKEN'*/}, this.github_base_url);
            this.ghe = new GitHub({/*token: 'MY_OAUTH_TOKEN'*/}, this.enterprise_base_url);

            for (i in this.github_repos) {
                if (this.github_repos[i].url.length == 0) {
                    this.github_repos[i].owner = '';
                    this.github_repos[i].repo = '';
                    continue;
                }

                let [owner, repo] = this.github_repos[i].url.split(/\//);
                this.github_repos[i].owner = owner;
                this.github_repos[i].repo = repo;
            }

            for (i in this.enterprise_repos) {
                if (this.enterprise_repos[i].url.length == 0) {
                    this.enterprise_repos[i].owner = '';
                    this.enterprise_repos[i].repo = '';
                    continue;
                }

                let [owner, repo] = this.enterprise_repos[i].url.split(/\//);
                this.enterprise_repos[i].owner = owner;
                this.enterprise_repos[i].repo = repo;
            }

        },
        loadProjects: function() {
            this.load();

            this.projects = [];
            let project_promises = [];

            // Grab github.com repos
            for (meta of this.github_repos) {
                if (meta.owner.length == 0 || meta.repo.length == 0) continue;

                let ghRepo = this.gh.getRepo(meta.owner, meta.repo);
                project_promises.push(ghRepo.listProjects());
            }

            // Grab github enterprise repos
            if (this.enterprise_base_url) {
                for (meta of this.enterprise_repos) {
                    if (meta.owner.length == 0 || meta.repo.length == 0) continue;

                    let ghRepo = this.ghe.getRepo(meta.owner, meta.repo);
                    project_promises.push(ghRepo.listProjects());
                }
            }

            // Resolve promises
            this.resolveProjects(project_promises);
        },
        loadMilestones: function() {
            this.load();
            this.loadPullRequests();

            this.milestones = [];
            let milestone_promises = [];

            // Grab github.com repos
            for (meta of this.github_repos) {
                if (meta.owner.length == 0 || meta.repo.length == 0) continue;

                let ghIssues = this.gh.getIssues(meta.owner, meta.repo);
                milestone_promises.push(ghIssues.listMilestones({state: 'all'}));
            }

            // Grab github enterprise repos
            if (this.enterprise_base_url) {
                for (meta of this.enterprise_repos) {
                    if (meta.owner.length == 0 || meta.repo.length == 0) continue;

                    let ghIssues = this.ghe.getIssues(meta.owner, meta.repo);
                    milestone_promises.push(ghIssues.listMilestones({state: 'all'}));
                }
            }

            // Resolve promises
            this.resolveMilestones(milestone_promises);
        },
        loadPullRequests: function() {
            this.pullrequests = [];
            let pr_promises = [];

            // Grab github.com repos
            for (meta of this.github_repos) {
                if (meta.owner.length == 0 || meta.repo.length == 0) continue;

                let ghRepo = this.gh.getRepo(meta.owner, meta.repo);
                pr_promises.push(ghRepo.listPullRequests({state: 'open'}));
            }

            // Grab github enterprise repos
            if (this.enterprise_base_url) {
                for (meta of this.enterprise_repos) {
                    if (meta.owner.length == 0 || meta.repo.length == 0) continue;

                    let ghRepo = this.ghe.getRepo(meta.owner, meta.repo);
                    pr_promises.push(ghRepo.listPullRequests({state: 'open'}));
                }
            }

            // Resolve promises
            this.resolvePullRequests(pr_promises);
        },

        resolveProjects: function(promises) {
            let self = this;

            $.combinator(promises)
            .then(function(responses) {
                responses.forEach(function(response) {
                    let projects = response.data
                    if (!Array.isArray(response.data)) {
                        projects = [projects];
                    }

                    for (let p of projects) {
                        meta = self.findMeta(p.url);
                        self.addProject(meta, p);
                    }
                });
            });
        },
        resolveMilestones: function(promises) {
            let self = this;

            $.combinator(promises)
            .then(function(responses) {
                responses.forEach(function(response) {
                    let milestones = response.data
                    if (!Array.isArray(response.data)) {
                        milestones = [milestones];
                    }

                    for (let m of milestones) {
                        meta = self.findMeta(m.url);
                        self.addMilestone(meta, m);
                    }
                });

                self.milestones = self.milestones.sort(function(a, b) {
                    let aDue = new Date(a.m.due_on).getTime();
                    let bDue = new Date(b.m.due_on).getTime();

                    if (aDue < bDue) return -1;
                    if (aDue > bDue) return 1;
                    return 0;
                });
            });
        },
        resolvePullRequests: function(promises) {
            let self = this;

            $.combinator(promises)
            .then(function(responses) {
                responses.forEach(function(response) {
                    let prs = response.data;

                    if (!Array.isArray(response.data)) {
                        prs = [prs];
                    }

                    for (let pr of prs) {
                        meta = self.findMeta(pr.url);
                        self.addPullRequest(meta, pr);
                    }
                });

                self.pullrequests = self.pullrequests.sort(function(a, b) {
                    let aUpdated = new Date(a.pr.updated_at).getTime();
                    let bUpdated = new Date(b.pr.updated_at).getTime();

                    if (aUpdated < bUpdated) return -1;
                    if (aUpdated > bUpdated) return 1;
                    return 0;
                });
            });
        },
        addProject: function(meta, project) {
            meta = this.findMeta(project.url);
            if (!meta) return;

            var p = this.buildProject(meta, project);

            this.projects = this.projects.concat(p);
        },
        addMilestone: function(meta, milestone) {
            meta = this.findMeta(milestone.url);
            if (!meta) return;

            let milestoneTime = new Date(milestone.due_on).getTime();
            if (this.oldest.getTime() > milestoneTime) return;

            let self = this;

            // Get issues
            let ghClient = (this.isGH(milestone.url)) ? this.gh : this.ghe;
            let m = this.buildMilestone(meta, milestone);

            ghClient
                .getIssues(meta.owner, meta.repo)
                .listIssues({
                    milestone: milestone.number,
                    state: 'all',
                    sort: 'updated',
                    direction: 'desc'
                }).then(function(response) {
                    m.issues = response.data;
                });

            this.milestones = this.milestones.concat(m);
        },
        addPullRequest: function(meta, pr) {
            meta = this.findMeta(pr.url);
            if (!meta) return;

            let prTime = new Date(pr.updated_at).getTime();
            if (this.oldest.getTime() > prTime) return;

            var p = this.buildPR(meta, pr);
            this.pullrequests = this.pullrequests.concat(p);
        },

        buildProject: function(meta, project) {
            return {
                owner: meta ? meta.owner : null,
                repo: meta ? meta.repo : null,
                p: project,
                cards: [],
                visible: true
            };
        },
        buildMilestone: function(meta, milestone) {
            return {
                owner: meta ? meta.owner : null,
                repo: meta ? meta.repo : null,
                m: milestone,
                issues: [],
                visible: true
            };
        },
        buildPR: function(meta, pr) {
            return {
                owner: meta ? meta.owner : null,
                repo: meta ? meta.repo : null,
                pr: pr,
                total_comments: parseInt(pr.comments) + parseInt(pr.review_comments),
                visible: true
            };
        },
        isGH: function(url) {
            return url.includes(this.github_base_url);
        },

        findMeta: function(url) {
            if (this.isGH(url)) {
                for (i in this.github_repos) {
                    if (this.github_repos[i].url.length === 0) continue;

                    if (url.includes(this.github_repos[i].url)) {
                        return this.github_repos[i];
                    }
                }

                return null;
            } else {
                for (i in this.enterprise_repos) {
                    if (this.enterprise_repos[i].url.length === 0) continue;

                    if (url.includes(this.enterprise_repos[i].url)) {
                        return this.enterprise_repos[i];
                    }
                }

                return null;
            }
        },

        // Used from templates

        isRecent: function(d) {
            let dTime = new Date(d);
            return (this.recent.getTime() < dTime.getTime());
        },

        repoEnabled: function(itemURL) {
            let meta = this.findMeta(itemURL);
            if (meta) {
                return meta.visible;
            }

            return false;
        },
        toggleRepo: function(type, i) {
            if (type === 'gh') {
                this.github_repos[i].visible = !this.github_repos[i].visible;
            } else {
                this.enterprise_repos[i].visible = !this.enterprise_repos[i].visible;
            }
        },
        toggleProject: function(i) {
            this.projects[i].visible = !this.projects[i].visible;
        },
        toggleMilestone: function(i) {
            this.milestones[i].visible = !this.milestones[i].visible;
        }

    }
});
